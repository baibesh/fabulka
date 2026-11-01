import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Book as BookRow, BookStatus, Prisma } from '@prisma/client';
import {
  BOOK_LABELS,
  BOOK_THEMES,
  LAYOUT_LOCKED,
  PHOTO_REFUSED,
  TemplateBlocksSchema,
  answersProblem,
  arrangeBlocks,
  availableVariants,
  blankPage,
  bookFormatOf,
  calmSpace,
  defaultThemeId,
  newLayout,
  planBook,
  progressFor,
  withFormat,
  withTheme,
  wordsPerPage,
  type BookTheme,
  type TemplateBlocks,
  type Book,
  type BookLayout,
  type PageLayout,
  type PageSubject,
  type PageTone,
  type PinLayout,
  type PhotoRefusal,
  type PhotoUpload,
  type UpdateLayout,
  type ChildProfile,
  type CreateBookInput,
  type ExampleBook,
  type Language,
  type MyBook,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
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
import { layoutOf, withHeadingCheck } from '../layout/layout';
import { PdfService } from '../pdf/pdf.service';
import { cleanPhoto, PhotoRefused } from '../photos/photo';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';

/** Body of a 400 from PATCH /books/:id/layout: the new block order breaks the template's rules. */
export const BLOCKS_REFUSED = 'blocks_refused';

/** What a refused photo's 400 says (the site shows its own text by `reason`). */
const PHOTO_MESSAGES: Record<PhotoRefusal, string> = {
  type: 'A photo must be a JPEG, PNG or HEIC file',
  size: 'The photo is too big: at most 8 MB',
  decode: 'The photo could not be read',
};

/** A page as stored in Book.pages. */
export interface StoredPage {
  page: number;
  text: string;
  scenePrompt: string;
  imagePath: string | null;
  /** Where SAM found the hero; null when SAM failed, missing for books made before. */
  subject?: PageSubject | null;
  /** How light the picture is where, measured when the book was first rendered. */
  tone?: PageTone | null;
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
  /** The book's theme: the template's, else by age. */
  theme: BookTheme;
  /** The template's blocks; null: the default ones. */
  blocks?: TemplateBlocks | null;
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
    private readonly reference: ReferenceService,
    private readonly themes: ThemesService,
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
          theme: BOOK_THEMES[defaultThemeId(child.age)],
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
    // The theme's type size at the book's format decides how many words fit on a page; the story is
    // written to fit.
    const format = bookFormatOf(await this.reference.defaultFormat());
    const layout = newLayout(job.theme, child.age, format, job.blocks);
    job.brief.wordsPerPage = wordsPerPage(
      layout.theme,
      child.age,
      layout.format,
    );
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
        layout: json(layout),
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

  /** Someone in a country without print wants this book printed; once per book. */
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

  /** A book; `editable` tells this visitor whether they may still change its layout. */
  async get(
    id: string,
    clientKey?: string,
    userId?: string | null,
  ): Promise<Book> {
    const row = await this.prisma.book.findUnique({
      where: { id },
      include: { ...withTemplate, _count: { select: { orders: true } } },
    });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    const editable =
      clientKey !== undefined &&
      row.status === 'done' &&
      row._count.orders === 0 &&
      ownsBook(row, clientKey, userId);
    return this.toDto(row, editable);
  }

  /**
   * The parent changes the look before ordering: another theme, or another layout for a page among
   * the ones that suit it. Only the layout changes; the book is re-rendered and re-checked.
   */
  async updateLayout(
    id: string,
    patch: UpdateLayout,
    clientKey: string,
    userId?: string | null,
  ): Promise<Book> {
    const row = await this.editableRow(id, clientKey, userId);
    const before = layoutOf(row.layout);
    let layout = before;
    if (patch.theme && patch.theme !== layout.theme.id)
      layout = withTheme(layout, await this.theme(patch.theme, row.language));
    if (patch.format && patch.format !== layout.format.id) {
      const format = await this.reference.publishedFormat(patch.format);
      layout = withFormat(layout, bookFormatOf(format));
    }
    if (patch.blocks) {
      const arranged = arrangeBlocks(layout, patch.blocks);
      if ('problem' in arranged) {
        throw new BadRequestException({
          code: BLOCKS_REFUSED,
          reason: arranged.problem,
          message: `These blocks cannot be arranged so: ${arranged.problem}`,
        });
      }
      layout = arranged.layout;
    }
    if (patch.dedication !== undefined) {
      if (
        patch.dedication !== null &&
        !layout.blocks.some((b) => b.kind === 'dedication')
      ) {
        throw new BadRequestException('The book has no dedication page');
      }
      layout = { ...layout, dedication: patch.dedication };
    }
    if (patch.photoCaption !== undefined) {
      if (!layout.photo)
        throw new BadRequestException('The book has no photo page');
      layout = {
        ...layout,
        photo: { ...layout.photo, caption: patch.photoCaption },
      };
    }
    if (patch.choices) {
      const plan = planBook(storedBook(row), layout);
      for (const [page, choice] of Object.entries(patch.choices)) {
        const start = plan.find((p) => p.key === `story-${page}`);
        if (!start) throw new BadRequestException(`No page ${page}`);
        const state = layout.pages[page];
        if (
          choice &&
          !availableVariants(layout.theme, state, start.index).includes(choice)
        ) {
          throw new BadRequestException(
            `Layout ${choice} does not suit page ${page}`,
          );
        }
        layout = setPage(layout, page, { choice });
      }
    }
    await this.rerender(id, layout);
    // The photo page was taken out: its photo goes too.
    if (before.photo && !layout.photo)
      await this.storage.remove(before.photo.path);
    return this.get(id, clientKey, userId);
  }

  /**
   * The parent's photo of the child for the photo page: checked by its bytes (JPEG, PNG or HEIC),
   * re-encoded as a JPEG without metadata (location included) next to the book's pictures, and the
   * photo page added before the end if the book has none yet (when the template offers it). A new
   * photo replaces the old one, whose file is deleted. The photo is never sent to any model.
   */
  async uploadPhoto(
    id: string,
    upload: PhotoUpload,
    clientKey: string,
    userId?: string | null,
  ): Promise<Book> {
    const row = await this.editableRow(id, clientKey, userId);
    let layout = layoutOf(row.layout);
    if (!layout.blocks.some((b) => b.kind === 'photo')) {
      const kinds = layout.blocks.map((b) => b.kind);
      kinds.splice(kinds.lastIndexOf('end'), 0, 'photo');
      const arranged = arrangeBlocks(layout, kinds);
      if ('problem' in arranged) {
        throw new BadRequestException({
          code: BLOCKS_REFUSED,
          reason: arranged.problem,
          message: `This book has no photo page: ${arranged.problem}`,
        });
      }
      layout = arranged.layout;
    }
    const bytes = Buffer.from(
      upload.image.slice(upload.image.indexOf(',') + 1),
      'base64',
    );
    const photo = await cleanPhoto(bytes).catch((error: unknown) => {
      if (!(error instanceof PhotoRefused)) throw error;
      throw new BadRequestException({
        code: PHOTO_REFUSED,
        reason: error.reason,
        message: PHOTO_MESSAGES[error.reason],
      });
    });
    const path = await this.storage.save(
      `books/${id}/photo-${randomBytes(6).toString('hex')}.jpg`,
      photo.data,
    );
    const old = layout.photo?.path;
    layout = {
      ...layout,
      photo: {
        path,
        caption: upload.caption ?? layout.photo?.caption ?? null,
        aspect: photo.width / photo.height,
      },
    };
    try {
      await this.rerender(id, layout);
    } catch (error) {
      await this.storage.remove(path);
      throw error;
    }
    if (old && old !== path) await this.storage.remove(old);
    return this.get(id, clientKey, userId);
  }

  /** A book this visitor may still change: theirs, finished and not ordered (404 / 409 otherwise). */
  private async editableRow(
    id: string,
    clientKey: string,
    userId?: string | null,
  ) {
    const row = await this.prisma.book.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!row || !ownsBook(row, clientKey, userId))
      throw new NotFoundException(`book ${id} not found`);
    if (row.status !== 'done')
      throw new ConflictException('The book is still being made');
    if (row._count.orders > 0) {
      throw new ConflictException({
        code: LAYOUT_LOCKED,
        message: 'The book is ordered: its layout is frozen',
      });
    }
    return row;
  }

  /** Staff pin a page's layout (any variant; null unpins) or change the theme, then re-render. */
  async pinLayout(id: string, patch: PinLayout): Promise<void> {
    const row = await this.prisma.book.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`book ${id} not found`);
    if (row.status !== 'done')
      throw new ConflictException('The book is still being made');
    let layout = layoutOf(row.layout);
    if (patch.theme && patch.theme !== layout.theme.id)
      layout = withTheme(layout, await this.theme(patch.theme, row.language));
    const pages = row.pages as unknown as StoredPage[];
    for (const [page, pin] of Object.entries(patch.pins ?? {})) {
      if (!pages.some((p) => String(p.page) === page))
        throw new BadRequestException(`No page ${page}`);
      layout = setPage(layout, page, { pin });
    }
    await this.rerender(id, layout);
  }

  /** A theme the book may switch to: selectable and covering its language; 400 otherwise. */
  private async theme(id: string, language: string): Promise<BookTheme> {
    const theme = await this.themes.pick(id, language as Language);
    if (!theme)
      throw new BadRequestException(`Theme ${id} cannot be used for this book`);
    return theme;
  }

  /**
   * Lays an unordered book out at another published format before it is ordered (the order form's
   * pick); nothing happens when it already has that format. Returns the new layout.
   */
  async ensureFormat(id: string, formatId: string): Promise<BookLayout> {
    const row = await this.prisma.book.findUniqueOrThrow({ where: { id } });
    const layout = layoutOf(row.layout);
    if (layout.format.id === formatId) return layout;
    const format = await this.reference.publishedFormat(formatId);
    await this.rerender(id, withFormat(layout, bookFormatOf(format)));
    return layoutOf(
      (await this.prisma.book.findUniqueOrThrow({ where: { id } })).layout,
    );
  }

  /** Renders the PDF again with a changed layout and stores both. */
  private async rerender(id: string, layout: BookLayout): Promise<void> {
    const row = await this.prisma.book.findUniqueOrThrow({ where: { id } });
    const result = await this.renderPdf(row, layout);
    await this.prisma.book.update({
      where: { id },
      data: {
        pdfPath: result.pdfPath,
        layout: json(result.layout),
        pages: json(result.pages),
      },
    });
  }

  /** Lays the book out, prints it and runs render QA; the result's layout records what QA did. */
  private async renderPdf(row: BookRow, layout = layoutOf(row.layout)) {
    const book = storedBook(row);
    const labels = BOOK_LABELS[book.language];
    const checked = withHeadingCheck(layout, [
      book.title ?? '',
      layout.dedication ?? labels.madeFor(book.childName),
      layout.photo?.caption ?? '',
      labels.talk,
      labels.end,
    ]);
    const stored = row.pages as unknown as StoredPage[];
    const pictures = stored.map((p) => ({
      page: p.page,
      subject: p.subject ?? null,
      tone: p.tone ?? null,
    }));
    const result = await this.journal.run({ bookId: row.id }, () =>
      this.pdf.render(row.id, book, checked, pictures),
    );
    // The tones are measured once and kept with the pages.
    const pages = stored.map((p) => ({
      ...p,
      tone: result.tones[p.page] ?? p.tone ?? null,
    }));
    return { ...result, pages };
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
    // A theme the template names, if it still covers the book's language; else by age.
    const named = template.layoutTheme
      ? await this.themes.pick(template.layoutTheme, child.language)
      : null;
    const blocks = TemplateBlocksSchema.safeParse(template.blocks);
    return {
      theme: named ?? BOOK_THEMES[defaultThemeId(child.age)],
      blocks: blocks.success ? blocks.data : null,
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
    { brief, style, toyUpload, theme }: Job,
    spent: Spend,
  ): Promise<void> {
    const { child } = brief;
    // Pictures leave calm space for text only when the theme first prints text over them.
    const textSpace = calmSpace(theme) ?? undefined;

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
    const review = await this.models.reviewStory(
      story,
      child.age,
      child.language,
    );
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
        textSpace,
      );
      spent.usd += image.costUsd;
      page.imagePath = await this.storage.save(
        `books/${id}/page-${page.page}.${image.ext}`,
        image.data,
      );
      // SAM finds the hero once, for the page layout; a failure only costs the page its overlays.
      try {
        const found = await this.models.findSubject(image.data, image.ext);
        spent.usd += found.costUsd;
        page.subject = found.subject;
      } catch (error) {
        this.logger.warn(
          `book ${id} page ${page.page}: no hero mask (${error instanceof Error ? error.message : String(error)})`,
        );
        page.subject = null;
      }
      done++;
      await this.update(id, 'pages', {
        pages: json(pages),
        costUsd: spent.usd,
        progress: progressFor('pages', done, pages.length),
      });
    });

    const row = await this.update(id, 'pdf', {
      pages: json(pages),
      costUsd: spent.usd,
      progress: progressFor('pdf'),
    });
    const rendered = await this.renderPdf(row);
    await this.update(id, 'done', {
      pdfPath: rendered.pdfPath,
      layout: json(rendered.layout),
      pages: json(rendered.pages),
      progress: 100,
    });
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

  toDto(row: BookWithTemplate, editable = false): Book {
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
      layout: layoutOf(row.layout),
      editable,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** What the renderer needs of a stored book; images by file name, as they sit next to book.html. */
export function storedBook(row: BookRow) {
  const child = row.child as unknown as ChildProfile;
  const local = (path: string | null) => (path ? basename(path) : null);
  return {
    title: row.title,
    childName: child.name,
    language: row.language as Language,
    heroImage: local(row.heroImagePath),
    pages: (row.pages as unknown as StoredPage[]).map((p) => ({
      page: p.page,
      text: p.text,
      image: local(p.imagePath),
    })),
    talkQuestions: row.talkQuestions as string[],
  };
}

/** The layout with one story page's state changed. */
function setPage(
  layout: BookLayout,
  page: string,
  patch: Partial<PageLayout>,
): BookLayout {
  const current = layout.pages[page] ?? blankPage();
  return {
    ...layout,
    pages: { ...layout.pages, [page]: { ...current, ...patch } },
  };
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
