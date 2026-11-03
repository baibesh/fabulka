import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Book as BookRow, BookStatus, Prisma } from '@prisma/client';
import {
  BOOK_THEMES,
  countWords,
  defaultThemeId,
  withTheme,
  wordsPerPage,
  type BookLayout,
  type ChildProfile,
  type Language,
} from '@fabulka/shared';
import { BooksService, Slots, type StoredPage } from '../books/books.service';
import { JournalService } from '../journal/journal.service';
import { layoutOf } from '../layout/layout';
import { MODEL_GATEWAY, type ModelGateway } from '../meta/model-gateway';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffSpendContext } from '../staff/caps.service';
import { EXAMPLES_TAG, SeoWebService } from '../seo/seo-web.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';
import {
  assembleTranslation,
  copyPlan,
  overflowingPages,
  translationBrief,
  translationRow,
} from './translation';

/** Rounds of shortening pages that overflow, each followed by a new render. */
const SHORTEN_ROUNDS = 2;
/** A shortened page aims at this share of its words. */
const SHORTEN_SHARE = 0.8;

/** Spend so far, kept across the retry and for the failure handler. */
interface Spend {
  usd: number;
}

/**
 * A failure worth one more try: the network, a timeout, the model's rate limit or a 5xx. A refusal,
 * invalid output after the gateway's own retries, or our own bug fail at once.
 */
export function isTransient(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError')
    return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (
    typeof code === 'string' &&
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)
  )
    return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timed? ?out|socket hang up|ECONNRESET|network/i.test(message);
}

/**
 * Translates an example's version into another language in the background: a new book that copies
 * the source's pictures, with the text translated by Muse Spark (the child's name spelled in the new
 * script), laid out in a theme that covers the language, printed and checked by render QA; a page
 * that overflows is shortened by the model and printed again. The book's status is the job's: the
 * admin shows "translating" until it is done or failed (a restart fails it, like any book caught
 * mid-way: BooksService.onModuleInit). Model calls go into the journal against the
 * new book, and their cost into its costUsd. A transient failure is tried once more.
 */
@Injectable()
export class TranslatorService {
  private readonly logger = new Logger(TranslatorService.name);
  /** Translations at once: each renders the book in Chromium, so a few at most. */
  private readonly slots: Slots;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly books: BooksService,
    private readonly themes: ThemesService,
    private readonly journal: JournalService,
    private readonly web: SeoWebService,
    @Inject(MODEL_GATEWAY) private readonly models: ModelGateway,
    config: ConfigService,
  ) {
    this.slots = new Slots(Number(config.get('TRANSLATION_CONCURRENCY', 2)));
  }

  /**
   * Makes the new book and its version row, then translates in the background; returns at once.
   * `retryMs` is the pause before the one retry (tests use 0). `staff` is who started it and for
   * which country: its model calls count against their daily caps.
   */
  async start(
    exampleId: string,
    source: BookRow,
    language: Language,
    retryMs = 3000,
    staff: StaffSpendContext = { staffEmail: null, staffCountry: null },
  ): Promise<string> {
    const row = await this.prisma.book.create({
      data: translationRow(source, language),
    });
    await this.prisma.exampleVersion.create({
      data: { exampleId, language, bookId: row.id },
    });
    const spent: Spend = { usd: 0 };
    void this.slots
      .run(() =>
        this.journal.run({ bookId: row.id, ...staff }, async () => {
          try {
            await this.translate(row.id, source.id, language, spent);
          } catch (error) {
            if (!isTransient(error)) throw error;
            this.logger.warn(
              `translation ${row.id}: ${message(error)}; trying once more`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryMs));
            await this.translate(row.id, source.id, language, spent);
          }
        }),
      )
      .then(() => this.web.revalidate([EXAMPLES_TAG]))
      .catch((error: unknown) => this.fail(row.id, error, spent.usd));
    return row.id;
  }

  /** One try at the whole translation; files are copied again, so a retry starts clean. */
  async translate(
    id: string,
    sourceId: string,
    language: Language,
    spent: Spend,
  ): Promise<void> {
    const source = await this.prisma.book.findUniqueOrThrow({
      where: { id: sourceId },
      include: { template: { select: { layoutTheme: true } } },
    });
    await this.update(id, 'story', { progress: 10 });
    for (const { from, to } of copyPlan(source, id))
      await this.storage.copy(from, to);

    const layout = await this.layoutFor(
      source,
      language,
      source.template?.layoutTheme ?? null,
    );
    const child = source.child as unknown as ChildProfile;
    const words = wordsPerPage(layout.theme, child.age, layout.format);
    const { translation, costUsd } = await this.models.translateBook(
      translationBrief(source, language, layout, words),
    );
    spent.usd += costUsd;
    const book = assembleTranslation(source, translation, language, id, layout);
    let row = await this.update(id, 'pdf', {
      ...book,
      child: json(book.child),
      pages: json(book.pages),
      talkQuestions: book.talkQuestions,
      layout: json(book.layout),
      costUsd: spent.usd,
      progress: 70,
    });

    // German runs long: a page whose text does not fit even at the smallest size is shortened by the
    // model and the book printed again.
    let rendered = await this.books.renderPdf(row, book.layout);
    for (let round = 0; round < SHORTEN_ROUNDS; round++) {
      const overflow = overflowingPages(rendered.layout);
      if (!overflow.length) break;
      const pages: StoredPage[] = rendered.pages.map((p) => ({ ...p }));
      for (const number of overflow) {
        const page = pages.find((p) => p.page === number);
        if (!page) continue;
        const short = await this.models.shortenPage({
          language,
          text: page.text,
          maxWords: Math.max(
            5,
            Math.min(words, Math.floor(countWords(page.text) * SHORTEN_SHARE)),
          ),
        });
        spent.usd += short.costUsd;
        page.text = short.text;
      }
      row = await this.update(id, 'pdf', {
        pages: json(pages),
        costUsd: spent.usd,
        progress: 85,
      });
      rendered = await this.books.renderPdf(row, book.layout);
    }

    await this.update(id, 'done', {
      pdfPath: rendered.pdfPath,
      layout: json(rendered.layout),
      pages: json(rendered.pages),
      costUsd: spent.usd,
      progress: 100,
      error: null,
    });
    this.logger.log(
      `translation ${id} (${source.language} → ${language}) done: $${spent.usd.toFixed(3)}`,
    );
  }

  /**
   * The source's layout in a theme that covers the new language: its own when it does
   * (themes.pick), else the catalog book's, else the theme for the child's age, as book creation
   * picks it.
   */
  async layoutFor(
    source: BookRow,
    language: Language,
    templateTheme: string | null,
  ): Promise<BookLayout> {
    const layout = layoutOf(source.layout);
    if (await this.themes.pick(layout.theme.id, language)) return layout;
    const named = templateTheme
      ? await this.themes.pick(templateTheme, language)
      : null;
    const age = (source.child as unknown as ChildProfile).age;
    return withTheme(layout, named ?? BOOK_THEMES[defaultThemeId(age)]);
  }

  /** Moves the book on; a failed or deleted book throws, which stops the job. */
  private update(id: string, status: BookStatus, data: Prisma.BookUpdateInput) {
    return this.prisma.book.update({
      where: { id, status: { not: 'failed' } },
      data: { ...data, status },
    });
  }

  /** Never throws: a background job must not take the process down with it. */
  private async fail(id: string, error: unknown, spentUsd: number) {
    this.logger.error(`translation ${id} failed: ${message(error)}`);
    try {
      await this.prisma.book.updateMany({
        where: { id },
        data: {
          status: 'failed',
          error: message(error).slice(0, 1000),
          costUsd: spentUsd,
        },
      });
    } catch (problem) {
      this.logger.error(
        `translation ${id}: could not record the failure`,
        problem,
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
