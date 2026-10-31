import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Book as BookRow, BookStatus, Prisma } from '@prisma/client';
import {
  answersProblem,
  progressFor,
  type Book,
  type ChildProfile,
  type CreateBookInput,
  type ExampleBook,
  type Language,
  type MyBook,
} from '@fabulka/shared';
import { basename } from 'node:path';
import { JournalService } from '../journal/journal.service';
import { MODEL_GATEWAY, type ModelGateway } from '../meta/model-gateway';
import { MethodologiesService } from '../methodologies/methodologies.service';
import type { StoryBrief } from '../meta/prompts';
import {
  questions,
  questionsInAnyLanguage,
  TemplatesService,
} from '../templates/templates.service';
import { toyUploadPath } from '../toy/toys.controller';
import { PdfService } from '../pdf/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** A page as stored in Book.pages. */
interface StoredPage {
  page: number;
  text: string;
  scenePrompt: string;
  imagePath: string | null;
}

/** The row with the catalog book slug the DTO needs. */
export type BookWithTemplate = BookRow & { template: { slug: string } | null };
export const withTemplate = { template: { select: { slug: true } } } as const;

/** Books made in this browser before anyone signed in to it: they move to whoever signs in. */
export function anonymousBooksOf(clientKey: string): Prisma.BookWhereInput {
  return { clientKey, userId: null };
}

/**
 * "My books": the signed-in parent's books plus this browser's anonymous ones. Books that moved
 * to an account are not shown to someone else in the same browser (signed out, or another account).
 */
export function myBooksWhere(
  clientKey: string,
  userId?: string | null,
): Prisma.BookWhereInput {
  const anonymous = anonymousBooksOf(clientKey);
  return userId ? { OR: [{ userId }, anonymous] } : anonymous;
}

/** The visitor may order (and see orders of) this book: made in this browser or in their account. */
export function ownsBook(
  book: { clientKey: string; userId: string | null },
  clientKey: string,
  userId?: string | null,
): boolean {
  if (book.userId === null) return book.clientKey === clientKey;
  return !!userId && book.userId === userId;
}

/** What generation needs besides the story brief. */
interface Job {
  brief: StoryBrief;
  /** Art style of a catalog book; the default one otherwise. */
  style?: string;
  /** The uploaded toy photo, when the parent sent one. */
  toyUpload?: string;
}

/** Example books shown on the home page at most. */
const EXAMPLE_COUNT = 12;

/** Page illustrations generated at once; each chains from the hero sheet, not from each other. */
const PAGE_CONCURRENCY = 4;

@Injectable()
export class BooksService implements OnModuleInit {
  private readonly logger = new Logger(BooksService.name);
  private readonly pageCount: number;
  /** Books generated at once; more wait their turn as "queued". */
  private readonly slots: Slots;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
    private readonly templates: TemplatesService,
    private readonly methodologies: MethodologiesService,
    @Inject(MODEL_GATEWAY) private readonly models: ModelGateway,
    private readonly journal: JournalService,
    config: ConfigService,
  ) {
    this.pageCount = Number(config.get('PAGE_COUNT', 10));
    this.slots = new Slots(Number(config.get('BOOK_CONCURRENCY', 3)));
  }

  /**
   * Generation lives in this process, so books caught mid-way by a restart or deploy would wait
   * forever. Fail them on start: the parent sees an error and the free book is not used up.
   */
  async onModuleInit() {
    const { count } = await this.prisma.book.updateMany({
      where: { status: { notIn: ['done', 'failed'] } },
      data: {
        status: 'failed',
        error:
          'Генерация прервалась: сервис перезапустился. Создайте книгу ещё раз.',
      },
    });
    if (count)
      this.logger.warn(
        `${count} unfinished books marked failed after a restart`,
      );
  }

  async create(
    input: CreateBookInput,
    clientKey: string,
    demo: boolean,
    country: string | null = null,
    userId: string | null = null,
  ): Promise<Book> {
    const { child } = input;
    const job: Job = input.template
      ? await this.catalogJob(input.template, input)
      : {
          brief: {
            child,
            pageCount: this.pageCount,
            methodology: await this.methodologies.forBook(
              input.methodology,
              child.age,
            ),
            theme: input.theme,
          },
        };
    if (input.toy) {
      await this.storage.read(toyUploadPath(input.toy.upload)).catch(() => {
        throw new BadRequestException(
          'Фото игрушки не найдено, загрузите его ещё раз',
        );
      });
      job.toyUpload = input.toy.upload;
    }
    const row = await this.prisma.book.create({
      data: {
        child,
        language: child.language,
        methodology: job.brief.methodology.slug,
        theme: job.brief.theme,
        template: input.template
          ? { connect: { slug: input.template } }
          : undefined,
        answers: input.answers,
        clientKey,
        user: userId ? { connect: { id: userId } } : undefined,
        demo,
        country,
        toyName: input.toy?.name || null,
      },
      include: withTemplate,
    });
    // Generation runs in the background, a few books at a time; the client polls GET /books/:id.
    // Inside journal.run every model call is recorded against this book.
    const spent: Spend = { usd: 0 };
    void this.slots
      .run(() =>
        this.journal.run({ bookId: row.id }, () =>
          this.generate(row.id, job, spent),
        ),
      )
      .catch((error: unknown) => this.fail(row.id, error, spent.usd));
    return this.toDto(row);
  }

  /** Someone outside Kazakhstan wants this book printed; once per book. */
  async recordPrintInterest(id: string, country: string | null) {
    const book = await this.prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundException(`book ${id} not found`);
    await this.prisma.printInterest.upsert({
      where: { bookId: id },
      create: { bookId: id, country },
      update: {},
    });
  }

  /** The signed-in parent's books and this browser's anonymous ones, newest first. */
  async listMine(clientKey: string, userId?: string | null): Promise<MyBook[]> {
    const rows = await this.prisma.book.findMany({
      where: myBooksWhere(clientKey, userId),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      childName: (row.child as unknown as ChildProfile).name,
      language: row.language as Language,
      heroImageUrl: this.storage.url(row.heroImagePath),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Finished books the admin picked as examples, newest first. */
  async listExamples(): Promise<ExampleBook[]> {
    const rows = await this.prisma.book.findMany({
      where: { featured: true, status: 'done', title: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: EXAMPLE_COUNT,
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title!,
      language: row.language as Language,
      heroImageUrl: this.storage.url(row.heroImagePath),
    }));
  }

  async get(id: string): Promise<Book> {
    const row = await this.prisma.book.findUnique({
      where: { id },
      include: withTemplate,
    });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    return this.toDto(row);
  }

  /** A catalog book: its method, plot, art style and the parent's answers. */
  private async catalogJob(slug: string, input: CreateBookInput): Promise<Job> {
    const template = await this.templates.find(slug);
    const { child } = input;
    if (child.age < template.ageMin || child.age > template.ageMax) {
      throw new BadRequestException(
        `«${template.title}» — для возраста ${template.ageMin}–${template.ageMax} лет`,
      );
    }
    const asked = questions(template);
    const answers = input.answers ?? {};
    const problem = answersProblem(questionsInAnyLanguage(template), answers);
    if (problem) {
      const { question, answer } = problem;
      throw new BadRequestException(
        problem.reason === 'required'
          ? `Ответьте на вопрос «${question.label}»`
          : `«${answer}» — нет такого варианта в вопросе «${question.label}»`,
      );
    }
    return {
      brief: {
        child,
        pageCount: this.pageCount,
        methodology: await this.methodologies.forTemplate(template.methodology),
        theme: template.theme,
        template: {
          title: template.title,
          plot: template.plot as string[],
          answers: asked
            .filter((q) => answers[q.key]?.trim())
            .map((q) => ({ question: q.label, answer: answers[q.key].trim() })),
        },
      },
      style: template.stylePrompt ?? undefined,
    };
  }

  private async generate(
    id: string,
    { brief, style, toyUpload }: Job,
    spent: Spend,
  ): Promise<void> {
    const { child } = brief;

    // The toy first: SAM cuts it out of the photo, Muse Spark puts it into words for the story.
    let toyReference: Buffer | null = null;
    if (toyUpload) {
      await this.stage(id, 'toy');
      const photo = await this.storage.read(toyUploadPath(toyUpload));
      const toyPhotoPath = await this.storage.save(
        `books/${id}/toy-photo.jpg`,
        photo,
      );
      await this.storage.remove(toyUploadPath(toyUpload));
      const found = await this.models.findToy(photo);
      toyReference = found.cutout ?? photo;
      const toyCutoutPath = found.cutout
        ? await this.storage.save(`books/${id}/toy-cutout.jpg`, found.cutout)
        : null;
      const described = await this.models.describeToy(toyReference);
      spent.usd += found.costUsd + described.costUsd;
      const row = await this.update(id, 'toy', {
        toyPhotoPath,
        toyCutoutPath,
        toyDescription: described.description,
        costUsd: spent.usd,
      });
      brief = {
        ...brief,
        toy: {
          name: row.toyName ?? undefined,
          description: described.description,
        },
      };
    }

    await this.stage(id, 'story');
    const { story, costUsd: storyCost } = await this.models.writeStory(brief);
    spent.usd += storyCost;
    const pages: StoredPage[] = story.pages.map((p) => ({
      page: p.page,
      text: p.text,
      scenePrompt: p.scene_prompt,
      imagePath: null,
    }));
    await this.update(id, 'story', {
      title: story.title,
      heroDescription: story.hero_description,
      pages: json(pages),
      talkQuestions: story.talk_questions,
      costUsd: spent.usd,
    });

    // A second pass before any picture is drawn: the parent's text went into the prompt.
    const review = await this.models.reviewStory(story, child.age);
    spent.usd += review.costUsd;
    if (!review.safe) {
      throw new Error(
        `Сказка не прошла проверку безопасности: ${review.reason}`,
      );
    }

    await this.stage(id, 'hero');
    const hero = await this.models.drawHero(story.hero_description, style);
    spent.usd += hero.costUsd;
    const heroImagePath = await this.storage.save(
      `books/${id}/hero.${hero.ext}`,
      hero.data,
    );
    await this.update(id, 'hero', {
      heroResponseId: hero.ref,
      heroImagePath,
      costUsd: spent.usd,
    });

    // The pet gets its own sheet too, or it changes breed and color between pages.
    let anchorRef = hero.ref;
    const withPet = story.pet_description !== null;
    if (story.pet_description) {
      const pet = await this.models.drawPet(
        story.pet_description,
        hero.ref,
        style,
      );
      spent.usd += pet.costUsd;
      const petImagePath = await this.storage.save(
        `books/${id}/pet.${pet.ext}`,
        pet.data,
      );
      anchorRef = pet.ref;
      await this.update(id, 'hero', { petImagePath, costUsd: spent.usd });
    }

    // The toy's sheet is drawn from the cut-out photo, chained after the hero (and pet).
    if (toyReference && brief.toy) {
      const toy = await this.models.drawToy(
        brief.toy.description,
        toyReference,
        anchorRef,
        style,
      );
      spent.usd += toy.costUsd;
      const toyImagePath = await this.storage.save(
        `books/${id}/toy.${toy.ext}`,
        toy.data,
      );
      anchorRef = toy.ref;
      await this.update(id, 'hero', { toyImagePath, costUsd: spent.usd });
    }

    await this.update(id, 'pages', {
      progress: progressFor('pages', 0, pages.length),
    });
    let done = 0;
    await eachLimit(pages, PAGE_CONCURRENCY, async (page) => {
      const image = await this.models.drawPage(
        page.scenePrompt,
        anchorRef,
        {
          pet: withPet && petInScene(page.scenePrompt),
          toy: toyReference !== null && toyInScene(page.scenePrompt),
        },
        style,
      );
      spent.usd += image.costUsd;
      page.imagePath = await this.storage.save(
        `books/${id}/page-${page.page}.${image.ext}`,
        image.data,
      );
      done++;
      await this.update(id, 'pages', {
        pages: json(pages),
        costUsd: spent.usd,
        progress: progressFor('pages', done, pages.length),
      });
    });

    await this.update(id, 'pdf', {
      pages: json(pages),
      costUsd: spent.usd,
      progress: progressFor('pdf'),
    });
    // Images sit next to book.html, so the template takes bare file names.
    const local = (path: string | null) => (path ? basename(path) : null);
    const pdfPath = await this.pdf.render(id, {
      title: story.title,
      childName: child.name,
      language: child.language,
      coverImage: local(heroImagePath),
      pages: pages.map((p) => ({
        page: p.page,
        text: p.text,
        image: local(p.imagePath),
      })),
      talkQuestions: story.talk_questions,
    });
    await this.update(id, 'done', { pdfPath, progress: 100 });
    this.logger.log(
      `book ${id} done: ${pages.length} pages, $${spent.usd.toFixed(3)}`,
    );
  }

  private stage(id: string, status: BookStatus) {
    return this.update(id, status, { progress: progressFor(status) });
  }

  /**
   * Moves a book on. A failed book stays failed: the update then throws, which stops the rest
   * of its generation (other pages still in flight, or a book deleted meanwhile).
   */
  private update(id: string, status: BookStatus, data: Prisma.BookUpdateInput) {
    return this.prisma.book.update({
      where: { id, status: { not: 'failed' } },
      data: { ...data, status },
    });
  }

  /** Never throws: a background generation must not take the process down with it. */
  private async fail(id: string, error: unknown, spentUsd?: number) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`book ${id} failed: ${message}`);
    try {
      // updateMany: the book may have been deleted while it was generating.
      await this.prisma.book.updateMany({
        where: { id },
        data: {
          status: 'failed',
          error: message.slice(0, 1000),
          // What was spent before it failed still counts against the budget.
          ...(spentUsd !== undefined && { costUsd: spentUsd }),
        },
      });
    } catch (problem) {
      this.logger.error(`book ${id}: could not record the failure`, problem);
    }
  }

  toDto(row: BookWithTemplate): Book {
    const pages = row.pages as unknown as StoredPage[];
    return {
      id: row.id,
      status: row.status,
      progress: row.progress,
      title: row.title,
      language: row.language as Language,
      childName: (row.child as unknown as ChildProfile).name,
      methodology: row.methodology,
      template: row.template?.slug ?? null,
      talkQuestions: row.talkQuestions as string[],
      heroImageUrl: this.storage.url(row.heroImagePath),
      toy: row.toyPhotoPath
        ? {
            name: row.toyName,
            photoUrl: this.storage.url(row.toyPhotoPath)!,
            cutoutUrl: this.storage.url(row.toyCutoutPath),
            sheetUrl: this.storage.url(row.toyImagePath),
          }
        : null,
      pages: pages.map((p) => ({
        page: p.page,
        text: p.text,
        imageUrl: this.storage.url(p.imagePath),
      })),
      pdfUrl: this.storage.url(row.pdfPath),
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** Pointing Muse Image at the pet sheet on every page draws the pet into scenes it is not in. */
export function petInScene(scenePrompt: string): boolean {
  return /\bthe pet\b/i.test(scenePrompt);
}

export function toyInScene(scenePrompt: string): boolean {
  return /\bthe toy\b/i.test(scenePrompt);
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Spend so far, shared with the failure handler so a failed book still records it. */
interface Spend {
  usd: number;
}

/** Runs at most `limit` tasks at once; the rest wait in order. */
class Slots {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Runs fn over items with at most `limit` in flight; after the first failure no new item starts. */
async function eachLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      try {
        await fn(items[next++]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}
