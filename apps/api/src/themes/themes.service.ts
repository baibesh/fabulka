import type { StaffSpendContext } from '../staff/caps.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Theme as ThemeRow } from '@prisma/client';
import {
  BOOK_THEMES,
  BookThemeSchema,
  DUPLICABLE_THEMES,
  LANGUAGES,
  ProposedThemeSchema,
  SAMPLE_BOOKS,
  SAMPLE_COMIC,
  SELECTABLE_THEMES,
  THEME_HISTORY_ACTIONS,
  THEME_REFUSED,
  ThemeCheckSchema,
  applyEdit,
  checksPass,
  copyNames,
  duplicableTheme,
  editFromProposal,
  isComicTheme,
  newLayout,
  proposalOf,
  quickChecks,
  themeChanges,
  themeFromProposal,
  type AdminTheme,
  type BookTheme,
  type Language,
  type RenderableBook,
  type ThemeCheck,
  type ThemeEdit,
  type ThemeHistoryEntry,
  type ThemeOrnamentResult,
  type ThemeRefinement,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { JournalService } from '../journal/journal.service';
import { languageText } from '../layout/alphabets';
import { missingGlyphs } from '../layout/fonts';
import { MOCK_SUBJECT } from '../meta/mock.gateway';
import { MODEL_GATEWAY, type ModelGateway } from '../meta/model-gateway';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Pastel sample pictures with a white "hero" disc, like the mock model draws (SAM's mask below). */
const SAMPLE_COLORS = ['#F9D9A8', '#BFE3D0', '#C9D7F2', '#F5C6D6'];
const samplePicture = (color: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">` +
      `<rect width="1536" height="1024" fill="${color}"/>` +
      `<circle cx="768" cy="440" r="160" fill="#ffffff" opacity="0.8"/></svg>`,
  );
/** The hero's character sheet on the framed cover: square, on white. */
const SAMPLE_HERO = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024" fill="#ffffff"/><circle cx="512" cy="430" r="230" fill="#F9D9A8"/>` +
    `<rect x="352" y="660" width="320" height="260" rx="120" fill="#BFE3D0"/></svg>`,
);
/** The disc of the sample pictures as SAM would find it (a 3:2 picture, centre 768,440, r 160). */
const SAMPLE_SUBJECT = {
  box: { x: 608 / 1536, y: 280 / 1024, w: 320 / 1536, h: 320 / 1024 },
  grid: MOCK_SUBJECT.grid,
};

/** An uploaded ornament: at most this many pixels in, at most this side out. */
const ORNAMENT_MAX_PIXELS = 25_000_000;
const ORNAMENT_SIDE = 1024;

const PreviewsSchema = z.partialRecord(z.enum(LANGUAGES), z.array(z.string()));
type Previews = z.infer<typeof PreviewsSchema>;

/** A published theme's saved edits waiting to be published (Theme.draft). */
const DraftSchema = z.object({
  theme: BookThemeSchema,
  checks: z.array(ThemeCheckSchema),
  previews: PreviewsSchema,
});

/** A theme checked through and through: its languages set, every check, the sample pages. */
interface Checked {
  theme: BookTheme;
  checks: ThemeCheck[];
  previews: Previews;
}

/** A change to a theme, for the route's Activity entry: the theme before and after. */
export interface ThemeChangeResult {
  entry: AdminTheme;
  before: BookTheme | null;
  after: BookTheme;
}

/**
 * The checks that need no renderer, in order: the theme JSON, fonts (from the vetted list, at a
 * weight that ships), contrast, sizes by age, then every letter of each language (and the sample
 * book's title) in each font the theme uses - comic lettering in capitals, as balloons print it.
 */
export function staticChecks(theme: BookTheme): ThemeCheck[] {
  const quick = quickChecks(theme);
  const fontsOk = quick[0].ok;
  const glyphs = LANGUAGES.map((language): ThemeCheck => {
    if (!fontsOk)
      return {
        check: 'glyphs',
        language,
        ok: false,
        detail: 'not checked: fix the fonts first',
      };
    const text = languageText(language) + SAMPLE_BOOKS[language].title;
    const missing = new Set([
      ...missingGlyphs(theme.fonts.body, text),
      ...missingGlyphs(theme.fonts.heading, text),
    ]);
    if (theme.lettering) {
      const comic = SAMPLE_COMIC[language];
      const letters = [text, comic.caption, ...comic.speech, comic.sfx]
        .join(' ')
        .toLocaleUpperCase(language);
      for (const c of missingGlyphs(theme.lettering.font, letters))
        missing.add(c);
    }
    return {
      check: 'glyphs',
      language,
      ok: !missing.size,
      detail: missing.size
        ? `missing ${[...missing].join(' ')}`
        : 'every letter covered',
    };
  });
  return [
    { check: 'schema', ok: true, detail: 'valid theme JSON' },
    ...quick,
    ...glyphs,
  ];
}

/** The languages whose glyph check passed. */
const covered = (checks: ThemeCheck[]): Language[] =>
  LANGUAGES.filter((l) =>
    checks.some((c) => c.check === 'glyphs' && c.language === l && c.ok),
  );

/**
 * The themes books can be laid out in: the curated ones in code, and the ones Muse Spark proposed or
 * staff copied and edited, once published. Every proposal and every save is checked in code - fonts
 * from the vetted list, contrast, sizes within the age limits, every letter of all five languages in
 * every font - and a sample book in each language goes through render QA, every page kept as a
 * preview. A proposal failing a check is refused; an edit failing one is kept as a draft that cannot
 * be published. A published theme's edits wait as pending changes until staff publish them; books
 * keep the copy of the theme they were laid out with, so only books made (or switched to it) after
 * that get the change.
 */
@Injectable()
export class ThemesService {
  private readonly logger = new Logger(ThemesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MODEL_GATEWAY) private readonly models: ModelGateway,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Themes staff and parents may pick, covering every one of `languages` when given. Comic themes
   * (with lettering) are left out unless `comic`: a story format names them, picture books do not.
   */
  async selectable(
    languages: readonly Language[] = [],
    { comic = false }: { comic?: boolean } = {},
  ): Promise<BookTheme[]> {
    const curated = SELECTABLE_THEMES.map((id) => BOOK_THEMES[id]);
    const rows = await this.prisma.theme.findMany({
      where: { published: true },
      orderBy: { createdAt: 'asc' },
    });
    const ai = rows.flatMap((row) => {
      const parsed = BookThemeSchema.safeParse(row.theme);
      return parsed.success ? [parsed.data] : [];
    });
    return [...curated, ...ai].filter(
      (theme) =>
        (comic || !isComicTheme(theme)) &&
        languages.every((l) => theme.languages.includes(l)),
    );
  }

  /** A selectable theme by id that covers `language`, or null. */
  async pick(
    id: string,
    language?: Language,
    options: { comic?: boolean } = {},
  ): Promise<BookTheme | null> {
    const themes = await this.selectable(language ? [language] : [], options);
    return themes.find((t) => t.id === id) ?? null;
  }

  /** Every theme for the admin: curated ones (read-only), then the stored ones, newest first. */
  async adminList(): Promise<AdminTheme[]> {
    const rows = await this.prisma.theme.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const curated: AdminTheme[] = DUPLICABLE_THEMES.map((id) => ({
      theme: BOOK_THEMES[id],
      status: 'published',
      brief: null,
      checks: [],
      previews: {},
      createdAt: null,
      editable: false,
      basedOn: null,
      draft: null,
      updatedAt: null,
    }));
    return [...curated, ...rows.map((row) => this.dto(row))];
  }

  /** One stored theme for the editor; 404 when there is none (curated ones are not stored). */
  async adminTheme(id: string): Promise<AdminTheme> {
    return this.dto(await this.row(id));
  }

  /**
   * Asks Muse Spark for a theme and checks it. Refused (422 theme_refused, with the checks) when a
   * check fails; otherwise stored as a draft with its previews. `staff` is who asked: the model
   * calls count against their daily cap.
   */
  async propose(
    brief: string,
    staff: StaffSpendContext = { staffEmail: null, staffCountry: null },
  ): Promise<AdminTheme> {
    return this.journal.run({ ...staff }, async () => {
      const id = `ai-${randomBytes(4).toString('hex')}`;
      const { proposal } = await this.models.proposeTheme(brief);
      const parsed = ProposedThemeSchema.safeParse(proposal);
      if (!parsed.success) this.refuse([schemaFailure(parsed.error)]);
      const proposed = parsed.data;
      const theme = themeFromProposal(id, proposed);
      const checks = staticChecks(theme);
      if (checks.some((c) => !c.ok)) this.refuse(checks);
      theme.languages = [...LANGUAGES];

      const folder = `themes/${id}`;
      try {
        // The ornament; a theme without one keeps its SVG shape.
        try {
          const ornament = await this.models.drawOrnament(
            proposed.ornamentPrompt,
          );
          // A drawn one comes on white with a wide margin: keyed out and trimmed to the motif.
          const cleaned =
            ornament.ext === 'svg'
              ? null
              : await this.pdf.cleanOrnament(ornament.data, ornament.ext);
          if (ornament.ext !== 'svg' && !cleaned)
            throw new Error('the ornament came back blank');
          theme.ornamentImage = await this.storage.save(
            `${folder}/ornament.${cleaned ? 'png' : ornament.ext}`,
            cleaned ?? ornament.data,
          );
        } catch (error) {
          this.logger.warn(
            `theme ${id}: no ornament (${error instanceof Error ? error.message : String(error)})`,
          );
        }
        const tried = await this.tryOn(folder, theme);
        checks.push(...tried.checks);
        if (checks.some((c) => !c.ok)) this.refuse(checks);
        const row = await this.prisma.theme.create({
          data: {
            id,
            brief,
            theme: json(theme),
            checks: json(checks),
            previews: json(tried.previews),
          },
        });
        await this.remember(id, 'create', theme, checks, staff.staffEmail);
        return this.dto(row);
      } catch (error) {
        await this.removeFolder(folder);
        throw error;
      }
    });
  }

  /**
   * An editable copy of a theme: a curated one (they stay read-only in code) or a stored one, as it
   * is published (its pending changes too, when it has some). Checked like any save and kept as a
   * draft; its own ornament file is copied, so editing the copy never touches the original.
   */
  async duplicate(id: string, who: string | null): Promise<ThemeChangeResult> {
    const curated = duplicableTheme(id);
    let source = curated;
    if (!source) {
      const row = await this.row(id);
      source = DraftSchema.safeParse(row.draft).data?.theme ?? this.live(row);
    }
    const copyId = `copy-${randomBytes(4).toString('hex')}`;
    const theme: BookTheme = {
      ...structuredClone(source),
      id: copyId,
      version: 1,
      source: 'ai',
      legacy: false,
      name: copyNames(source),
      ornamentImage: null,
    };
    try {
      if (
        source.ornamentImage &&
        (await this.storage.exists(source.ornamentImage))
      ) {
        theme.ornamentImage = await this.storage.copy(
          source.ornamentImage,
          `themes/${copyId}/ornament-${randomBytes(8).toString('hex')}${extname(source.ornamentImage)}`,
        );
      }
      const checked = await this.checkAll(theme, this.renderFolder(theme));
      const row = await this.prisma.theme.create({
        data: {
          id: copyId,
          brief: '',
          basedOn: id,
          theme: json(checked.theme),
          checks: json(checked.checks),
          previews: json(checked.previews),
        },
      });
      await this.remember(
        copyId,
        'duplicate',
        checked.theme,
        checked.checks,
        who,
      );
      return { entry: this.dto(row), before: null, after: checked.theme };
    } catch (error) {
      await this.removeFolder(`themes/${copyId}`);
      throw error;
    }
  }

  /**
   * Saves staff's edit of a stored theme and checks it through. A theme not published takes it at
   * once, failing checks or not (it cannot be published until they pass). A published theme keeps
   * what books and pickers use and holds the edit as pending changes, published separately.
   */
  async save(
    id: string,
    edit: ThemeEdit,
    who: string | null,
  ): Promise<ThemeChangeResult> {
    const row = await this.row(id);
    const live = this.live(row);
    const pending = DraftSchema.safeParse(row.draft).data ?? null;
    if (edit.ornamentImage && !(await this.ownOrnament(id, edit.ornamentImage)))
      throw new BadRequestException(
        'The ornament must be one uploaded for this theme',
      );
    const before = pending?.theme ?? live;
    const theme = applyEdit({ ...live, version: live.version + 1 }, edit);
    const folder = this.renderFolder(theme);
    await this.removeFolder(folder);
    const checked = await this.checkAll(theme, folder);
    const updated = row.published
      ? await this.prisma.theme.update({
          where: { id },
          data: { draft: json(checked) },
        })
      : await this.prisma.theme.update({
          where: { id },
          data: {
            theme: json(checked.theme),
            checks: json(checked.checks),
            previews: json(checked.previews),
          },
        });
    // The sample pages of the version it replaced (an unpublished theme's), never its ornament.
    if (!row.published) await this.removeFolder(this.renderFolder(live));
    await this.remember(id, 'save', checked.theme, checked.checks, who);
    return { entry: this.dto(updated), before, after: checked.theme };
  }

  /**
   * Publishes a stored theme, or its pending changes; or takes it back. Only a theme (or changes)
   * that passed every check is published (422 theme_refused with the checks otherwise). Taken back,
   * it is no longer offered to staff or parents; pending changes become the theme; books keep their
   * copy of it, and catalog books that named it go back to picking by age, as when it is deleted.
   */
  async publish(
    id: string,
    published: boolean,
    who: string | null = null,
  ): Promise<ThemeChangeResult> {
    const row = await this.row(id);
    const live = this.live(row);
    const pending = DraftSchema.safeParse(row.draft).data ?? null;
    const next: Checked = pending ?? {
      theme: live,
      checks: this.checksOf(row),
      previews: PreviewsSchema.safeParse(row.previews).data ?? {},
    };
    if (published && !checksPass(next.checks)) this.refuse(next.checks);
    const updated = await this.prisma.theme.update({
      where: { id },
      data: {
        published,
        ...(pending
          ? {
              theme: json(pending.theme),
              checks: json(pending.checks),
              previews: json(pending.previews),
              draft: Prisma.DbNull,
            }
          : {}),
      },
    });
    if (pending && pending.theme.version !== live.version)
      await this.removeFolder(this.renderFolder(live));
    if (!published) await this.releaseTemplates(id);
    if (published)
      await this.remember(id, 'publish', next.theme, next.checks, who);
    return { entry: this.dto(updated), before: live, after: next.theme };
  }

  /** Drops a published theme's pending changes: what is published stays as it is. */
  async discard(id: string, who: string | null): Promise<ThemeChangeResult> {
    const row = await this.row(id);
    const live = this.live(row);
    const pending = DraftSchema.safeParse(row.draft).data ?? null;
    if (!pending) return { entry: this.dto(row), before: live, after: live };
    const updated = await this.prisma.theme.update({
      where: { id },
      data: { draft: Prisma.DbNull },
    });
    await this.removeFolder(this.renderFolder(pending.theme));
    await this.remember(id, 'discard', live, this.checksOf(row), who);
    return { entry: this.dto(updated), before: pending.theme, after: live };
  }

  /**
   * "Refine with words": Muse Spark adjusts the theme as the editor holds it to the owner's comment
   * (the propose call, given the current theme). Nothing is saved: the editor shows what changed and
   * the checks that need no renderer; staff save it like any edit. Model calls count against `staff`'s
   * daily cap.
   */
  async refine(
    id: string,
    comment: string,
    edit: ThemeEdit,
    staff: StaffSpendContext = { staffEmail: null, staffCountry: null },
  ): Promise<ThemeRefinement> {
    const row = await this.row(id);
    const live = this.live(row);
    return this.journal.run({ ...staff }, async () => {
      const { proposal } = await this.models.proposeTheme(
        comment,
        proposalOf(edit, 'the current ornament'),
      );
      const parsed = ProposedThemeSchema.safeParse(proposal);
      if (!parsed.success) this.refuse([schemaFailure(parsed.error)]);
      const next = editFromProposal(edit, parsed.data);
      return {
        theme: next,
        changes: themeChanges(edit, next),
        checks: staticChecks(applyEdit(live, next)),
      };
    });
  }

  /** The editor's fields checked without saving (no renderer): what it shows while staff type. */
  check(edit: ThemeEdit): ThemeCheck[] {
    return staticChecks(applyEdit({ ...BOOK_THEMES.fairy, id: 'check' }, edit));
  }

  /**
   * Stores an ornament staff uploaded for a theme (a PNG, JPEG or WebP): made a PNG at most 1024 px
   * a side, a picture without transparency keyed out from its white and trimmed like a drawn one. A
   * new file every time, so books laid out with the old one keep it. It takes effect when the theme
   * is saved with it.
   */
  async uploadOrnament(
    id: string,
    dataUrl: string,
  ): Promise<ThemeOrnamentResult> {
    await this.row(id);
    const bytes = Buffer.from(
      dataUrl.slice(dataUrl.indexOf(',') + 1),
      'base64',
    );
    let png: Buffer;
    let alpha: boolean;
    try {
      const meta = await sharp(bytes).metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format ?? ''))
        throw new Error('type');
      if ((meta.width ?? 0) * (meta.height ?? 0) > ORNAMENT_MAX_PIXELS)
        throw new Error('size');
      alpha = meta.hasAlpha ?? false;
      png = await sharp(bytes, { limitInputPixels: ORNAMENT_MAX_PIXELS })
        .rotate()
        .resize(ORNAMENT_SIDE, ORNAMENT_SIDE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'The ornament must be a PNG, JPEG or WebP file',
      );
    }
    const cleaned = alpha ? png : await this.pdf.cleanOrnament(png, 'png');
    if (!cleaned) throw new BadRequestException('The ornament is all white');
    const path = await this.storage.save(
      `themes/${id}/ornament-${randomBytes(8).toString('hex')}.png`,
      cleaned,
    );
    return { path, url: this.storage.url(path)! };
  }

  /** What happened to a stored theme, newest first (at most 50 entries). */
  async history(id: string): Promise<ThemeHistoryEntry[]> {
    await this.row(id);
    const rows = await this.prisma.themeHistory.findMany({
      where: { themeId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.flatMap((row) => {
      const theme = BookThemeSchema.safeParse(row.theme);
      const action = z.enum(THEME_HISTORY_ACTIONS).safeParse(row.action);
      if (!theme.success || !action.success) return [];
      const checks = z.array(ThemeCheckSchema).safeParse(row.checks).data ?? [];
      return [
        {
          id: row.id,
          action: action.data,
          version: row.version,
          theme: theme.data,
          checks,
          ok: checksPass(checks),
          who: row.who,
          at: row.createdAt.toISOString(),
        },
      ];
    });
  }

  /** Catalog books that named the theme go back to a theme by age. */
  private releaseTemplates(id: string) {
    return this.prisma.bookTemplate.updateMany({
      where: { layoutTheme: id },
      data: { layoutTheme: null },
    });
  }

  /**
   * Deletes a stored theme, its history and its files. Books keep their copy of it; catalog books
   * that named it go back to picking by age.
   */
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.theme.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException(`theme ${id} not found`);
    await this.prisma.themeHistory.deleteMany({ where: { themeId: id } });
    await this.releaseTemplates(id);
    await this.removeFolder(`themes/${id}`);
  }

  /**
   * Every check on `theme`; when the ones that need no renderer pass, a sample book in every language
   * through render QA in `folder`, its pages kept as previews. The theme's languages are those whose
   * letters both fonts cover.
   */
  private async checkAll(theme: BookTheme, folder: string): Promise<Checked> {
    const checks = staticChecks(theme);
    const checked = { ...theme, languages: covered(checks) };
    if (checks.some((c) => !c.ok)) {
      checks.push({
        check: 'render',
        ok: false,
        detail: 'not run: fix the checks above first',
      });
      return { theme: checked, checks, previews: {} };
    }
    const tried = await this.tryOn(folder, checked);
    return {
      theme: checked,
      checks: [...checks, ...tried.checks],
      previews: tried.previews,
    };
  }

  /** A sample book in every language through render QA in `folder`, each page kept as a preview. */
  private async tryOn(
    folder: string,
    theme: BookTheme,
  ): Promise<{ checks: ThemeCheck[]; previews: Previews }> {
    await this.storage.save(`${folder}/hero.svg`, SAMPLE_HERO);
    for (const [i, color] of SAMPLE_COLORS.entries()) {
      await this.storage.save(
        `${folder}/page-${i + 1}.svg`,
        samplePicture(color),
      );
    }
    const pictures = SAMPLE_COLORS.map((_, i) => ({
      page: i + 1,
      subject: SAMPLE_SUBJECT,
      tone: null,
    }));
    const results = await this.pdf.renderSamples(
      folder,
      LANGUAGES.map((language) => ({
        name: language,
        book: sampleBook(language),
      })),
      newLayout(theme, 6),
      pictures,
    );
    const previews: Previews = {};
    const checks: ThemeCheck[] = [];
    for (const result of results) {
      const language = result.name as Language;
      previews[language] = result.previews;
      checks.push({
        check: 'render',
        language,
        ok: result.qa.status !== 'blocked',
        detail:
          result.qa.status === 'blocked'
            ? result.qa.issues
                .map((i) => `${i.page}: ${i.kind} (${i.detail})`)
                .join('; ')
            : result.qa.status === 'shrunk'
              ? 'fits after a small shrink'
              : 'everything fits',
      });
    }
    return { checks, previews };
  }

  /**
   * Where a version's sample pages go: its own folder, so a new save never overwrites the pages of
   * the published version (and image URLs change with it). A proposal's first version keeps its
   * pages in the theme's folder.
   */
  private renderFolder(theme: BookTheme): string {
    return `themes/${theme.id}/v${theme.version}`;
  }

  /** An ornament uploaded or drawn for this theme (never another theme's file, nor a path outside). */
  private async ownOrnament(id: string, path: string): Promise<boolean> {
    const prefix = `themes/${id}/`;
    if (!path.startsWith(prefix)) return false;
    if (
      !/^ornament(-[0-9a-f]{16})?\.(png|svg|jpeg|webp)$/.test(
        path.slice(prefix.length),
      )
    )
      return false;
    return this.storage.exists(path);
  }

  private async remember(
    themeId: string,
    action: (typeof THEME_HISTORY_ACTIONS)[number],
    theme: BookTheme,
    checks: ThemeCheck[],
    who: string | null,
  ): Promise<void> {
    await this.prisma.themeHistory.create({
      data: {
        themeId,
        action,
        version: theme.version,
        theme: json(theme),
        checks: json(checks),
        who,
      },
    });
  }

  private async row(id: string): Promise<ThemeRow> {
    const row = await this.prisma.theme.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`theme ${id} not found`);
    return row;
  }

  private live(row: ThemeRow): BookTheme {
    return BookThemeSchema.parse(row.theme);
  }

  private checksOf(row: Pick<ThemeRow, 'checks'>): ThemeCheck[] {
    return z.array(ThemeCheckSchema).safeParse(row.checks).data ?? [];
  }

  private removeFolder(folder: string) {
    return rm(join(this.storage.root, folder), {
      recursive: true,
      force: true,
    });
  }

  private refuse(checks: ThemeCheck[]): never {
    const failed = checks.filter((c) => !c.ok);
    throw new UnprocessableEntityException({
      code: THEME_REFUSED,
      message: failed
        .map(
          (c) =>
            `${c.check}${c.language ? ` (${c.language})` : ''}: ${c.detail}`,
        )
        .join('; '),
      checks,
    });
  }

  private urls(previews: Previews): Previews {
    return Object.fromEntries(
      Object.entries(previews).map(([language, paths]) => [
        language,
        paths.map((p) => this.storage.url(p)!),
      ]),
    );
  }

  private dto(row: ThemeRow): AdminTheme {
    const pending = DraftSchema.safeParse(row.draft).data ?? null;
    return {
      theme: BookThemeSchema.parse(row.theme),
      status: row.published ? 'published' : 'draft',
      brief: row.brief || null,
      checks: this.checksOf(row),
      previews: this.urls(PreviewsSchema.safeParse(row.previews).data ?? {}),
      createdAt: row.createdAt.toISOString(),
      editable: true,
      basedOn: row.basedOn ?? null,
      draft: pending
        ? { ...pending, previews: this.urls(pending.previews) }
        : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** A proposal that is not valid theme JSON, as the failed schema check. */
function schemaFailure(error: z.ZodError): ThemeCheck {
  return {
    check: 'schema',
    ok: false,
    detail: error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; '),
  };
}

/** The sample book in `language`, its pictures by file name next to the sample's HTML. */
export function sampleBook(language: Language): RenderableBook {
  const sample = SAMPLE_BOOKS[language];
  return {
    title: sample.title,
    childName: sample.childName,
    language,
    heroImage: 'hero.svg',
    pages: sample.pages.map((text, i) => ({
      page: i + 1,
      text,
      image: `page-${i + 1}.svg`,
    })),
    talkQuestions: sample.talkQuestions,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
