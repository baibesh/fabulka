import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type BookTemplate, type PageSeo } from '@prisma/client';
import {
  DEFAULT_SEO_SETTINGS,
  EMPTY_SEO_FIELDS,
  FALLBACK_LANGUAGES,
  REDIRECT_INVALID,
  SEO_KEYS,
  SEO_STATIC_PAGES,
  SeoAnalyticsSchema,
  SeoFieldsSchema,
  SeoRobotsSchema,
  SeoSettingsSchema,
  SeoVerificationSchema,
  normalizeRedirectPath,
  redirectProblem,
  sameSeoFields,
  seoPageKind,
  seoPagePath,
  seoPageTarget,
  type AdminSeoPage,
  type Language,
  type PublicRedirect,
  type PublicSeoPages,
  type PublishSeoResult,
  type Redirect,
  type RedirectInput,
  type SeoFields,
  type SeoHistoryEntry,
  type SeoSettings,
  type TemplateTranslation,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { ExamplesService } from '../examples/examples.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { REDIRECTS_TAG, SEO_TAG, SeoWebService } from './seo-web.service';

/** An OG image is stored at the size social networks show: 1200×630. */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MAX_PIXELS = 50_000_000;

/** The fields stored in a row's JSON column, or the empty ones when it is broken or missing. */
export function storedFields(value: unknown): SeoFields {
  const parsed = SeoFieldsSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_SEO_FIELDS;
}

/**
 * What reverting a page's history entry puts back into the draft: the values from before that
 * change (a first save or publish had none: the defaults).
 */
export function revertedFields(entry: { before: unknown }): SeoFields {
  return entry.before === null || entry.before === undefined
    ? EMPTY_SEO_FIELDS
    : storedFields(entry.before);
}

/** A page's history target split back into its key and language. */
export function splitTarget(
  target: string,
): { key: string; language: Language } | null {
  const at = target.lastIndexOf('@');
  if (at < 0) return null;
  const language = target.slice(at + 1);
  if (!(FALLBACK_LANGUAGES as Record<string, unknown>)[language]) return null;
  return { key: target.slice(0, at), language: language as Language };
}

type Translations = Partial<Record<Language, TemplateTranslation>>;

/** A catalog book's title and summary in `language` (its fallbacks; Russian lives in the columns). */
function templateText(row: BookTemplate, language: Language) {
  const translations = (row.translations ?? {}) as Translations;
  for (const l of FALLBACK_LANGUAGES[language]) {
    if (l === 'ru') break;
    const text = translations[l];
    if (text) return { title: text.title, summary: text.summary };
  }
  return { title: row.title, summary: row.summary };
}

const json = (value: unknown) => value as Prisma.InputJsonValue;
/** A value for a nullable JSON column: null is stored as SQL NULL. */
const nullableJson = (value: unknown) =>
  value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);

/**
 * The admin's «SEO»: per-page SEO by language (a draft staff edit, published on demand), the
 * history of every change with revert, redirects and the global settings (Setting table, seo.*).
 * Publishing tells the site to re-render (SeoWebService) and IndexNow which addresses changed.
 */
@Injectable()
export class SeoService {
  private readonly siteHost: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly web: SeoWebService,
    private readonly examples: ExamplesService,
    config: ConfigService,
  ) {
    this.siteHost = new URL(
      config.get<string>('PUBLIC_URL', 'http://localhost:3000'),
    ).host;
  }

  // ---- Pages ----------------------------------------------------------------------------------

  /** Every page with SEO in this language: fixed pages, published catalog books, example books. */
  async pages(language: Language): Promise<AdminSeoPage[]> {
    const [templates, books, rows] = await Promise.all([
      this.prisma.bookTemplate.findMany({
        where: { published: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.exampleBooks(language),
      this.prisma.pageSeo.findMany({ where: { language } }),
    ]);
    const byKey = new Map(rows.map((row) => [row.page, row]));
    const entry = (
      key: string,
      label: string | null,
      summary: string | null,
      coverUrl: string | null,
    ) => this.toAdmin(key, byKey.get(key), label, summary, coverUrl);
    return [
      ...SEO_STATIC_PAGES.map((key) => entry(key, null, null, null)),
      ...templates.map((t) => {
        const text = templateText(t, language);
        return entry(
          `template:${t.slug}`,
          text.title,
          text.summary,
          t.coverUrl,
        );
      }),
      ...books.map((b) =>
        entry(`book:${b.id}`, b.title, null, this.storage.url(b.heroImagePath)),
      ),
    ];
  }

  async page(key: string, language: Language): Promise<AdminSeoPage> {
    const found = (await this.pages(language)).find((p) => p.key === key);
    if (!found) throw new NotFoundException('No such page');
    return found;
  }

  /** Saves the draft of a page in a language; the site keeps serving the published one. */
  async save(
    key: string,
    language: Language,
    fields: SeoFields,
    who: string | null,
  ): Promise<AdminSeoPage> {
    const current = await this.page(key, language);
    if (sameSeoFields(current.draft, fields)) return current;
    await this.prisma.$transaction([
      this.prisma.pageSeo.upsert({
        where: { page_language: { page: key, language } },
        create: { page: key, language, draft: json(fields), updatedBy: who },
        update: { draft: json(fields), updatedBy: who },
      }),
      this.prisma.seoHistory.create({
        data: {
          kind: 'page',
          target: seoPageTarget(key, language),
          action: 'save',
          before: nullableJson(current.draft),
          after: nullableJson(fields),
          who,
        },
      }),
    ]);
    return this.page(key, language);
  }

  /**
   * Makes drafts live: one page in one language, or every page with unpublished changes. The site
   * re-renders at once, and IndexNow hears the changed pages in all their language versions.
   */
  async publish(
    target: { key: string; language: Language } | null,
    who: string | null,
  ): Promise<PublishSeoResult> {
    if (target) await this.page(target.key, target.language);
    const rows = await this.prisma.pageSeo.findMany({
      where: target ? { page: target.key, language: target.language } : {},
    });
    const pending = rows.filter(
      (row) =>
        !sameSeoFields(
          storedFields(row.draft),
          row.published === null ? null : storedFields(row.published),
        ) || row.published === null,
    );
    const now = new Date();
    await this.prisma.$transaction(
      pending.flatMap((row) => [
        this.prisma.pageSeo.update({
          where: { page_language: { page: row.page, language: row.language } },
          data: {
            published: nullableJson(storedFields(row.draft)),
            publishedAt: now,
          },
        }),
        this.prisma.seoHistory.create({
          data: {
            kind: 'page',
            target: seoPageTarget(row.page, row.language),
            action: 'publish',
            before: nullableJson(
              row.published === null ? null : storedFields(row.published),
            ),
            after: nullableJson(storedFields(row.draft)),
            who,
          },
        }),
      ]),
    );
    // An example book's page is public in its own language only; other pages in all of them.
    const urls = [
      ...new Set([
        ...this.web.urls(
          pending
            .filter((row) => seoPageKind(row.page) !== 'book')
            .map((row) => seoPagePath(row.page)),
        ),
        ...this.web.urlsIn(
          pending
            .filter((row) => seoPageKind(row.page) === 'book')
            .map((row) => ({
              path: seoPagePath(row.page),
              language: row.language as Language,
            })),
        ),
      ]),
    ];
    const revalidated = await this.web.revalidate([SEO_TAG]);
    const indexNow = await this.web.pingIndexNow(urls);
    return { published: pending.length, urls, revalidated, indexNow };
  }

  /** How many pages have unpublished changes, by language. */
  async pendingCounts(): Promise<Record<string, number>> {
    const rows = await this.prisma.pageSeo.findMany();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const published =
        row.published === null ? null : storedFields(row.published);
      if (published && sameSeoFields(storedFields(row.draft), published)) {
        continue;
      }
      counts[row.language] = (counts[row.language] ?? 0) + 1;
    }
    return counts;
  }

  /** What the site serves in a language: the published SEO of the pages that have any. */
  async publicPages(language: Language): Promise<PublicSeoPages> {
    const rows = await this.prisma.pageSeo.findMany({
      where: { language },
    });
    const pages: PublicSeoPages = {};
    for (const row of rows) {
      if (row.published === null) continue;
      const fields = storedFields(row.published);
      pages[row.page] = {
        title: fields.title,
        description: fields.description,
        ogImageUrl: this.storage.url(fields.ogImage),
        noindex: fields.noindex,
      };
    }
    return pages;
  }

  // ---- History --------------------------------------------------------------------------------

  async history(kind: string, target?: string): Promise<SeoHistoryEntry[]> {
    const rows = await this.prisma.seoHistory.findMany({
      where: { kind, ...(target ? { target } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as SeoHistoryEntry['kind'],
      target: row.target,
      action: row.action as SeoHistoryEntry['action'],
      before: row.before,
      after: row.after,
      who: row.who,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Puts a page back as it was before a recorded change: the values before it go into the draft
   * (recorded as a revert); publishing makes them live, as with any edit.
   */
  async revert(id: string, who: string | null): Promise<AdminSeoPage> {
    const entry = await this.prisma.seoHistory.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('No such change');
    const target = entry.kind === 'page' ? splitTarget(entry.target) : null;
    if (!target) {
      throw new BadRequestException('Only page changes can be reverted');
    }
    const current = await this.page(target.key, target.language);
    const fields = revertedFields(entry);
    await this.prisma.$transaction([
      this.prisma.pageSeo.upsert({
        where: {
          page_language: { page: target.key, language: target.language },
        },
        create: {
          page: target.key,
          language: target.language,
          draft: json(fields),
          updatedBy: who,
        },
        update: { draft: json(fields), updatedBy: who },
      }),
      this.prisma.seoHistory.create({
        data: {
          kind: 'page',
          target: entry.target,
          action: 'revert',
          before: nullableJson(current.draft),
          after: nullableJson(fields),
          who,
        },
      }),
    ]);
    return this.page(target.key, target.language);
  }

  // ---- OG images ------------------------------------------------------------------------------

  /** Stores an uploaded OG image (JPEG, PNG or WebP by its bytes) as a 1200×630 JPEG. */
  async uploadImage(dataUrl: string): Promise<{ path: string; url: string }> {
    const bytes = Buffer.from(
      dataUrl.slice(dataUrl.indexOf(',') + 1),
      'base64',
    );
    let image: Buffer;
    try {
      const meta = await sharp(bytes).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) {
        throw new Error('type');
      }
      if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXELS) {
        throw new Error('size');
      }
      image = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'The image must be a JPEG, PNG or WebP file',
      );
    }
    const path = await this.storage.save(
      `seo/og-${randomBytes(8).toString('hex')}.jpg`,
      image,
    );
    return { path, url: this.storage.url(path)! };
  }

  // ---- Redirects ------------------------------------------------------------------------------

  async redirects(): Promise<Redirect[]> {
    const rows = await this.prisma.redirect.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRedirect);
  }

  async publicRedirects(): Promise<PublicRedirect[]> {
    const rows = await this.prisma.redirect.findMany({
      where: { active: true },
    });
    return rows.map((r) => ({
      from: r.from,
      to: r.to,
      status: r.status === 302 ? 302 : 301,
    }));
  }

  async createRedirect(input: RedirectInput, who: string | null) {
    const data = await this.checkedRedirect(input, null);
    const row = await this.prisma.redirect.create({ data });
    await this.record('redirect', row.id, 'create', null, toRedirect(row), who);
    await this.web.revalidate([REDIRECTS_TAG]);
    return toRedirect(row);
  }

  async updateRedirect(id: string, input: RedirectInput, who: string | null) {
    const before = await this.prisma.redirect.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('No such redirect');
    const data = await this.checkedRedirect(input, id);
    const row = await this.prisma.redirect.update({ where: { id }, data });
    await this.record(
      'redirect',
      id,
      'update',
      toRedirect(before),
      toRedirect(row),
      who,
    );
    await this.web.revalidate([REDIRECTS_TAG]);
    return toRedirect(row);
  }

  async deleteRedirect(id: string, who: string | null): Promise<void> {
    const before = await this.prisma.redirect.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('No such redirect');
    await this.prisma.redirect.delete({ where: { id } });
    await this.record('redirect', id, 'delete', toRedirect(before), null, who);
    await this.web.revalidate([REDIRECTS_TAG]);
  }

  private async checkedRedirect(input: RedirectInput, id: string | null) {
    const others = await this.prisma.redirect.findMany({
      where: id ? { id: { not: id } } : {},
    });
    const problem = redirectProblem(input, others, this.siteHost);
    if (problem) {
      throw new BadRequestException({
        code: REDIRECT_INVALID,
        reason: problem,
        message: `Redirect refused: ${problem}`,
      });
    }
    return {
      from: normalizeRedirectPath(input.from),
      to: input.to.trim(),
      status: input.status,
      active: input.active,
    };
  }

  // ---- Settings -------------------------------------------------------------------------------

  /** The global settings; a missing or broken key falls back to its default. */
  async settings(): Promise<SeoSettings> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: Object.values(SEO_KEYS) } },
    });
    const value = (key: string) => rows.find((r) => r.key === key)?.value;
    const pick = <T>(
      key: string,
      schema: { safeParse(v: unknown): { success: boolean; data?: T } },
      fallback: T,
    ): T => {
      const parsed = schema.safeParse(value(key));
      return parsed.success ? (parsed.data as T) : fallback;
    };
    const sitemap = value(SEO_KEYS.sitemap) as
      { examples?: unknown } | undefined;
    return {
      verification: pick(
        SEO_KEYS.verification,
        SeoVerificationSchema,
        DEFAULT_SEO_SETTINGS.verification,
      ),
      analytics: pick(
        SEO_KEYS.analytics,
        SeoAnalyticsSchema,
        DEFAULT_SEO_SETTINGS.analytics,
      ),
      robots: pick(
        SEO_KEYS.robots,
        SeoRobotsSchema,
        DEFAULT_SEO_SETTINGS.robots,
      ),
      sitemapExamples:
        typeof sitemap?.examples === 'boolean'
          ? sitemap.examples
          : DEFAULT_SEO_SETTINGS.sitemapExamples,
    };
  }

  async saveSettings(
    input: SeoSettings,
    who: string | null,
  ): Promise<SeoSettings & { revalidated: boolean }> {
    const next = SeoSettingsSchema.parse(input);
    const before = await this.settings();
    const values: Record<string, unknown> = {
      [SEO_KEYS.verification]: next.verification,
      [SEO_KEYS.analytics]: next.analytics,
      [SEO_KEYS.robots]: next.robots,
      [SEO_KEYS.sitemap]: { examples: next.sitemapExamples },
    };
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value: json(value) },
          update: { value: json(value) },
        }),
      ),
    );
    await this.record('settings', 'settings', 'update', before, next, who);
    const revalidated = await this.web.revalidate([SEO_TAG]);
    return { ...next, revalidated };
  }

  // ---- Helpers --------------------------------------------------------------------------------

  /**
   * Example books in `language`: each finished version of an example is a public page with SEO of
   * its own, in its own language only.
   */
  private async exampleBooks(language: Language) {
    return (await this.examples.publicVersions()).filter(
      (v) => v.language === language,
    );
  }

  private toAdmin(
    key: string,
    row: PageSeo | undefined,
    label: string | null,
    summary: string | null,
    coverUrl: string | null,
  ): AdminSeoPage {
    const draft = row ? storedFields(row.draft) : EMPTY_SEO_FIELDS;
    const published =
      row && row.published !== null ? storedFields(row.published) : null;
    return {
      key,
      path: seoPagePath(key),
      kind: seoPageKind(key),
      label,
      summary,
      coverUrl,
      draft,
      published,
      pending:
        Boolean(row) &&
        (published === null || !sameSeoFields(draft, published)),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
    };
  }

  private record(
    kind: string,
    target: string,
    action: string,
    before: unknown,
    after: unknown,
    who: string | null,
  ) {
    return this.prisma.seoHistory.create({
      data: {
        kind,
        target,
        action,
        before: nullableJson(before),
        after: nullableJson(after),
        who,
      },
    });
  }
}

function toRedirect(row: {
  id: string;
  from: string;
  to: string;
  status: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Redirect {
  return {
    id: row.id,
    from: row.from,
    to: row.to,
    status: row.status === 302 ? 302 : 301,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
