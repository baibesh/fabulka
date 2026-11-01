import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { BookTemplate, Prisma } from '@prisma/client';
import {
  FALLBACK_LANGUAGES,
  LANGUAGES,
  pickLanguage,
  type Answers,
  type ChildProfile,
  type Language,
  type Template,
  type TemplateQuestion,
  type TemplateSummary,
  type TemplateTranslation,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SEED_TEMPLATES } from './catalog';
import { SEED_TRANSLATIONS } from './catalog-i18n';
import { seedTextUpdates } from '../common/seed-texts';
import { SEEDED_TRANSLATIONS_V1 } from './seeded';

type Translations = Partial<Record<Language, TemplateTranslation>>;

@Injectable()
export class TemplatesService implements OnModuleInit {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds catalog books that are missing and translations to books that have none; never
   * overwrites what the admin has changed.
   */
  async onModuleInit() {
    const { count } = await this.prisma.bookTemplate.createMany({
      data: SEED_TEMPLATES.map((t, i): Prisma.BookTemplateCreateManyInput => ({
        slug: t.slug,
        title: t.title,
        summary: t.summary,
        ageMin: t.ageMin,
        ageMax: t.ageMax,
        methodology: t.methodology,
        languages: [...LANGUAGES],
        theme: t.theme,
        plot: t.plot,
        questions: t.questions,
        stylePrompt: t.stylePrompt,
        // Covers ship with the web app (apps/web/public/catalog).
        coverUrl: `/catalog/${t.slug}.jpg`,
        translations: SEED_TRANSLATIONS[t.slug] ?? {},
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
    if (count) this.logger.log(`added ${count} catalog books`);
    for (const [slug, translations] of Object.entries(SEED_TRANSLATIONS)) {
      await this.prisma.bookTemplate.updateMany({
        where: { slug, translations: { equals: {} } },
        data: { translations },
      });
    }
    await this.addSeedTranslations();
  }

  /**
   * Gives the seed catalog books today's seed translations where a book has none in a language
   * added after it was seeded, or still has an older seed translation (SEEDED_TRANSLATIONS_*);
   * never replaces one the admin wrote.
   */
  private async addSeedTranslations() {
    const rows = await this.prisma.bookTemplate.findMany({
      where: { slug: { in: Object.keys(SEED_TRANSLATIONS) } },
      select: { slug: true, translations: true },
    });
    for (const row of rows) {
      const seed: Translations = SEED_TRANSLATIONS[row.slug] ?? {};
      const translations = { ...(row.translations as Translations | null) };
      const langs = seedTextUpdates(
        translations,
        seed,
        [SEEDED_TRANSLATIONS_V1[row.slug]],
        (translation) => !translation,
      );
      if (!langs.length) continue;
      for (const lang of langs) translations[lang] = seed[lang];
      await this.prisma.bookTemplate.update({
        where: { slug: row.slug },
        data: { translations },
      });
      this.logger.log(
        `updated ${langs.join(', ')} of catalog book ${row.slug}`,
      );
    }
  }

  async list(lang: Language = 'ru'): Promise<TemplateSummary[]> {
    const rows = await this.prisma.bookTemplate.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => summary(row, lang));
  }

  async get(slug: string, lang: Language = 'ru'): Promise<Template> {
    const row = await this.find(slug);
    // A sample is shown only once it is a finished book; a deleted one goes with its row.
    const samples = await this.prisma.templateSample.findMany({
      where: { templateId: row.id, book: { status: 'done' } },
      select: {
        language: true,
        book: {
          select: { id: true, child: true, toyName: true, answers: true },
        },
      },
    });
    // The visitor's language, else the one they read next (Russian for Kazakh, English for Spanish).
    const language = pickLanguage(
      samples.map((s) => s.language as Language),
      lang,
    );
    const sample = samples.find((s) => s.language === language)?.book;
    // The sample's child is shown publicly anyway: the admin picked the book to be seen.
    const child = sample?.child as unknown as ChildProfile | undefined;
    return {
      ...summary(row, lang),
      questions: localizedQuestions(row, lang),
      sampleBookId: sample?.id ?? null,
      sampleLanguage: sample ? language : null,
      sampleDetails:
        sample && child
          ? {
              name: child.name,
              city: child.city,
              pet: child.pet ?? null,
              toyName: sample.toyName,
              answers: (sample.answers as Answers | null) ?? {},
            }
          : null,
    };
  }

  /** The published catalog book, or a 404. */
  async find(slug: string): Promise<BookTemplate> {
    const row = await this.prisma.bookTemplate.findUnique({ where: { slug } });
    if (!row?.published)
      throw new NotFoundException(`книги «${slug}» нет в каталоге`);
    return row;
  }
}

export function questions(row: BookTemplate): TemplateQuestion[] {
  return row.questions as unknown as TemplateQuestion[];
}

/**
 * The translation to show in `lang`: its own, else its fallbacks' (English for Spanish and German);
 * undefined where Russian, the book's own text in its columns, comes first.
 */
function translation(
  row: BookTemplate,
  lang: Language,
): TemplateTranslation | undefined {
  const translations = (row.translations ?? {}) as Translations;
  for (const l of FALLBACK_LANGUAGES[lang]) {
    if (l === 'ru') return undefined;
    if (translations[l]) return translations[l];
  }
  return undefined;
}

function localizedQuestions(
  row: BookTemplate,
  lang: Language,
): TemplateQuestion[] {
  const text = translation(row, lang)?.questions ?? {};
  return questions(row).map((q) => ({
    ...q,
    label: text[q.key]?.label ?? q.label,
    placeholder: text[q.key]?.placeholder ?? q.placeholder,
    options: text[q.key]?.options ?? q.options,
  }));
}

/**
 * The questions with every language's options allowed, so an answer picked in the Kazakh or
 * English interface passes the same check as a Russian one.
 */
export function questionsInAnyLanguage(row: BookTemplate): TemplateQuestion[] {
  const translations = Object.values(row.translations as Translations);
  return questions(row).map((q) => ({
    ...q,
    options: q.options && [
      ...q.options,
      ...translations.flatMap((t) => t?.questions[q.key]?.options ?? []),
    ],
  }));
}

function summary(row: BookTemplate, lang: Language): TemplateSummary {
  const text = translation(row, lang);
  return {
    slug: row.slug,
    title: text?.title ?? row.title,
    summary: text?.summary ?? row.summary,
    ageMin: row.ageMin,
    ageMax: row.ageMax,
    methodology: row.methodology,
    languages: row.languages as TemplateSummary['languages'],
    coverUrl: row.coverUrl,
  };
}
