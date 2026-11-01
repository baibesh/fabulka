import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Theme as ThemeRow } from '@prisma/client';
import {
  BOOK_THEMES,
  BookThemeSchema,
  LANGUAGES,
  ProposedThemeSchema,
  SAMPLE_BOOKS,
  SELECTABLE_THEMES,
  THEME_REFUSED,
  ThemeCheckSchema,
  checkContrast,
  checkFonts,
  checkSizes,
  newLayout,
  themeFromProposal,
  type AdminTheme,
  type BookTheme,
  type Language,
  type RenderableBook,
  type ThemeCheck,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
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

const PreviewsSchema = z.partialRecord(z.enum(LANGUAGES), z.array(z.string()));

/**
 * The themes books can be laid out in: the curated ones in code, and the ones Muse Spark proposed
 * that staff published. A proposal is checked in code before it is stored — fonts from the vetted
 * list, contrast, sizes within the age limits, every letter of all five languages in both fonts —
 * then its ornament is drawn and a sample book in each language goes through render QA, with every
 * page kept as a preview. A theme failing any check is refused, saying which and why.
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

  /** Themes staff and parents may pick, covering every one of `languages` when given. */
  async selectable(languages: readonly Language[] = []): Promise<BookTheme[]> {
    const curated = SELECTABLE_THEMES.map((id) => BOOK_THEMES[id]);
    const rows = await this.prisma.theme.findMany({
      where: { published: true },
      orderBy: { createdAt: 'asc' },
    });
    const ai = rows.flatMap((row) => {
      const parsed = BookThemeSchema.safeParse(row.theme);
      return parsed.success ? [parsed.data] : [];
    });
    return [...curated, ...ai].filter((theme) =>
      languages.every((l) => theme.languages.includes(l)),
    );
  }

  /** A selectable theme by id that covers `language`, or null. */
  async pick(id: string, language?: Language): Promise<BookTheme | null> {
    const themes = await this.selectable(language ? [language] : []);
    return themes.find((t) => t.id === id) ?? null;
  }

  /** Every theme for the admin: curated ones, then the proposed ones, newest first. */
  async adminList(): Promise<AdminTheme[]> {
    const rows = await this.prisma.theme.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const curated: AdminTheme[] = SELECTABLE_THEMES.map((id) => ({
      theme: BOOK_THEMES[id],
      status: 'published',
      brief: null,
      checks: [],
      previews: {},
      createdAt: null,
    }));
    return [...curated, ...rows.map((row) => this.dto(row))];
  }

  /**
   * Asks Muse Spark for a theme and checks it. Refused (422 theme_refused, with the checks) when a
   * check fails; otherwise stored as a draft with its previews.
   */
  async propose(brief: string): Promise<AdminTheme> {
    return this.journal.run({}, async () => {
      const id = `ai-${randomBytes(4).toString('hex')}`;
      const { proposal } = await this.models.proposeTheme(brief);
      const parsed = ProposedThemeSchema.safeParse(proposal);
      if (!parsed.success) {
        this.refuse([
          {
            check: 'schema',
            ok: false,
            detail: parsed.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        ]);
      }
      const proposed = parsed.data;
      const theme = themeFromProposal(id, proposed);
      const checks: ThemeCheck[] = [
        { check: 'schema', ok: true, detail: 'valid theme JSON' },
        checkFonts(theme),
        checkContrast(theme),
        checkSizes(theme),
      ];
      if (checks.some((c) => !c.ok)) this.refuse(checks);
      // Every letter of every language, and the book's fixed words, in both fonts (the cmap test).
      const glyphs = LANGUAGES.map((language): ThemeCheck => {
        const text = languageText(language) + SAMPLE_BOOKS[language].title;
        const missing = [
          ...new Set([
            ...missingGlyphs(theme.fonts.body, text),
            ...missingGlyphs(theme.fonts.heading, text),
          ]),
        ];
        return {
          check: 'glyphs',
          language,
          ok: !missing.length,
          detail: missing.length
            ? `missing ${missing.join(' ')}`
            : 'every letter covered',
        };
      });
      checks.push(...glyphs);
      if (glyphs.some((c) => !c.ok)) this.refuse(checks);
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
        // A sample book in every language through render QA, each page kept as a preview.
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
        const previews: Partial<Record<Language, string[]>> = {};
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
        if (checks.some((c) => !c.ok)) this.refuse(checks);
        const row = await this.prisma.theme.create({
          data: {
            id,
            brief,
            theme: json(theme),
            checks: json(checks),
            previews: json(previews),
          },
        });
        return this.dto(row);
      } catch (error) {
        await rm(join(this.storage.root, folder), {
          recursive: true,
          force: true,
        });
        throw error;
      }
    });
  }

  async publish(id: string, published: boolean): Promise<AdminTheme> {
    const row = await this.prisma.theme
      .update({ where: { id }, data: { published } })
      .catch(() => {
        throw new NotFoundException(`theme ${id} not found`);
      });
    return this.dto(row);
  }

  /**
   * Deletes a proposed theme and its files. Books keep their copy of it; catalog books that named it
   * go back to picking by age.
   */
  async remove(id: string): Promise<void> {
    const { count } = await this.prisma.theme.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException(`theme ${id} not found`);
    await this.prisma.bookTemplate.updateMany({
      where: { layoutTheme: id },
      data: { layoutTheme: null },
    });
    await rm(join(this.storage.root, 'themes', id), {
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

  private dto(row: ThemeRow): AdminTheme {
    const previews = PreviewsSchema.safeParse(row.previews).data ?? {};
    return {
      theme: BookThemeSchema.parse(row.theme),
      status: row.published ? 'published' : 'draft',
      brief: row.brief,
      checks: z.array(ThemeCheckSchema).safeParse(row.checks).data ?? [],
      previews: Object.fromEntries(
        Object.entries(previews).map(([language, paths]) => [
          language,
          paths.map((p) => this.storage.url(p)!),
        ]),
      ),
      createdAt: row.createdAt.toISOString(),
    };
  }
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
