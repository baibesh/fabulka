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
import { Prisma, type Book as BookRow, type BookStatus } from '@prisma/client';
import {
  BOOK_LABELS,
  BOOK_THEMES,
  GenerationStateSchema,
  LAYOUT_LOCKED,
  PAGE_CONCURRENCY,
  PHOTO_REFUSED,
  TemplateBlocksSchema,
  FRAME_CONCURRENCY,
  answersProblem,
  arrangeBlocks,
  countWords,
  formatEstimate,
  frameBox,
  frameImageSize,
  frameKey,
  framesRange,
  isPanelPage,
  normalizePages,
  pageProse,
  samConceptsFor,
  storedPageFrom,
  textRule,
  type CastMember,
  type PipelineStepId,
  type RenderablePage,
  type SamConcept,
  type StoredFrame,
  type StoredPage,
  type StoryFormatData,
  availableVariants,
  beatOf,
  blankPage,
  bookFormatOf,
  calmSpace,
  defaultThemeId,
  generationView,
  newLayout,
  planBook,
  progressFor,
  stateOfStatus,
  statusOfStep,
  withFormat,
  withTheme,
  wordsPerPage,
  type BookFormat,
  type BookTheme,
  type GenerationState,
  type GenerationStep,
  type GenerationView,
  type TemplateBlocks,
  type Book,
  type BookLayout,
  type PageLayout,
  type PageSubject,
  PageSubjectSchema,
  PageToneSchema,
  type PinLayout,
  type PhotoRefusal,
  type PhotoUpload,
  type UpdateLayout,
  type ChildProfile,
  type CreateBookInput,
  type Language,
  type MyBook,
  HeroPhotoRecordSchema,
  lookSentence,
  type HeroPhotoRecord,
  type PhotoFallback,
  type PlaceOptions,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { JournalService } from '../journal/journal.service';
import {
  MODEL_GATEWAY,
  type GeneratedImage,
  type ModelGateway,
} from '../meta/model-gateway';
import { illustrateFrame } from './illustrate';
import { GenerationTimings } from './timings';
import { MethodologiesService } from '../methodologies/methodologies.service';
import type { StoryBrief } from '../meta/prompts';
import {
  questions,
  questionsInAnyLanguage,
  TemplatesService,
} from '../templates/templates.service';
import { toyUploadPath } from '../toy/toys.controller';
import { layoutOf, withHeadingCheck } from '../layout/layout';
import { PdfService, type RenderHooks } from '../pdf/pdf.service';
import { cleanPhoto, PhotoRefused } from '../photos/photo';
import { HeroPhotosService } from '../photos/hero-photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';
import { isSafetyRefusal } from '../meta/refusal';
import {
  softenScene,
  type CastInFrame,
  type Companions,
} from '../meta/prompts';
import { FormatsService } from '../formats/formats.service';
import {
  type BookReferences,
  ReferencesService,
} from '../references/references.service';

/** Rounds of shortening texts that overflow on panel pages, each followed by a new render. */
const SHORTEN_ROUNDS = 2;

/** Body of a 400 from PATCH /books/:id/layout: the new block order breaks the template's rules. */
export const BLOCKS_REFUSED = 'blocks_refused';

/** What a refused photo's 400 says (the site shows its own text by `reason`). */
const PHOTO_MESSAGES: Record<PhotoRefusal, string> = {
  type: 'A photo must be a JPEG, PNG or HEIC file',
  size: 'The photo is too big: at most 8 MB',
  decode: 'The photo could not be read',
};

/** A page as stored in Book.pages (StoredPage in @fabulka/shared; normalizePages reads older books). */
export type { StoredPage } from '@fabulka/shared';

/** A side character or recurring thing as Book.cast keeps it: its look and, once drawn, its sheet. */
export interface StoredCast extends CastMember {
  imagePath: string | null;
  /** The sheet's Muse Image response id (frames chain from the last sheet). */
  responseId: string | null;
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
  /** Art style of a catalog book; the format's (else the default) otherwise. */
  style?: string;
  /** The uploaded toy photo, when the parent sent one. */
  toyUpload?: string;
  /** The child's photo for the hero (the photo path) and its record, which generation fills in. */
  heroPhoto?: PhotoTrack;
  /** The printed size the book is laid out at (its frames' shapes decide the pictures' sizes). */
  printFormat?: BookFormat;
}

@Injectable()
export class BooksService implements OnModuleInit {
  private readonly logger = new Logger(BooksService.name);
  private readonly pageCount: number;
  /** Books generated at once; more wait their turn as "queued". */
  private readonly slots: Slots;
  /** Typical durations of the model calls, for the progress screen's time left. */
  private readonly timings: GenerationTimings;

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
    private readonly references: ReferencesService,
    private readonly formats: FormatsService,
    private readonly heroPhotos: HeroPhotosService,
    config: ConfigService,
  ) {
    this.pageCount = Number(config.get('PAGE_COUNT', 10));
    this.formats.pageCount = this.pageCount;
    this.slots = new Slots(Number(config.get('BOOK_CONCURRENCY', 3)));
    this.timings = new GenerationTimings(
      prisma,
      config.get<string>('MODELS', 'mock') === 'mock',
    );
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
      : await this.ownJob(input);
    // The theme's type size at the book's format decides how many words fit on a page; the story is
    // written to fit.
    const format = bookFormatOf(await this.reference.defaultFormat());
    const story = job.brief.format;
    const layout = {
      ...newLayout(job.theme, child.age, format, job.blocks),
      // A format with more than one frame a page draws panels: its gutter and border.
      panels:
        framesRange(story).max > 1 || !textRule(story, 'narration')
          ? { gutterMm: story.gutterMm, borderMm: story.borderMm }
          : null,
    };
    job.printFormat = layout.format;
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
    // The photo path: the photo must be this parent's (the controller checked sign-in and country).
    if (input.heroPhoto) {
      if (!userId)
        throw new BadRequestException('Sign in to draw the hero from a photo');
      const { consent, uploadedAt } = await this.heroPhotos.consentOf(
        input.heroPhoto.upload,
        userId,
      );
      job.heroPhoto = {
        upload: input.heroPhoto.upload,
        record: HeroPhotoRecordSchema.parse({
          consent,
          uploadedAt,
          upload: input.heroPhoto.upload,
        }),
      };
    }
    const row = await this.prisma.book.create({
      data: {
        child,
        language: child.language,
        methodology: job.brief.methodology.slug,
        storyFormat: story.slug,
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
        ...(job.heroPhoto && { heroPhoto: json(job.heroPhoto.record) }),
        generation: json(
          firstState(
            !!job.toyUpload,
            !!child.pet?.trim(),
            job.brief.pageCount,
            new Date(),
            expectedFrames(story, job.brief.pageCount),
            !!job.heroPhoto,
          ),
        ),
      },
      include: withTemplate,
    });
    // Another book may have taken the same photo a moment earlier: this one draws from the description.
    // (That photo is the other book's to delete, so this one forgets it.)
    if (
      job.heroPhoto &&
      !(await this.heroPhotos.claim(job.heroPhoto.upload, row.id))
    ) {
      const record = { ...job.heroPhoto.record, fallback: 'missing' as const };
      job.heroPhoto = undefined;
      await this.prisma.book.update({
        where: { id: row.id },
        data: { heroPhoto: json(record) },
      });
    }
    // Generation runs in the background, a few books at a time; the client polls GET /books/:id.
    // Inside journal.run every model call is recorded against this book.
    const spent: Spend = { usd: 0 };
    void this.slots
      .run(() =>
        this.journal.run({ bookId: row.id }, () =>
          this.generate(row.id, job, spent),
        ),
      )
      .catch((error: unknown) => this.fail(row.id, error, spent.usd))
      // Whatever happened, the child's photo does not outlive the generation.
      .finally(() => job.heroPhoto && this.dropPhoto(row.id, job.heroPhoto));
    return this.toDto(row);
  }

  /**
   * The safety net after a generation: a photo still stored (the book failed before its hero) is
   * deleted, and the book's record says when. Never throws.
   */
  private async dropPhoto(id: string, track: PhotoTrack): Promise<void> {
    try {
      const at = await this.heroPhotos.remove(
        track.upload,
        'the book stopped before its hero was drawn',
        id,
      );
      if (!at) return;
      track.record.deletedAt = at.toISOString();
      await this.prisma.book.updateMany({
        where: { id },
        data: { heroPhoto: json(track.record) },
      });
    } catch (error) {
      this.logger.error(`book ${id}: could not drop the hero photo`, error);
    }
  }

  /** A book of your own: the parent's method (or the age's), its format, the format's theme or the age's. */
  private async ownJob(input: CreateBookInput): Promise<Job> {
    const { child } = input;
    const methodology = await this.methodologies.forBook(
      input.methodology,
      child.age,
    );
    const format = await this.formats.forBook(methodology.format);
    return {
      theme:
        (await this.formatTheme(format, child.language)) ??
        BOOK_THEMES[defaultThemeId(child.age)],
      brief: {
        child,
        pageCount: format.pageCount ?? this.pageCount,
        methodology,
        format,
        theme: input.theme,
      },
    };
  }

  /** The theme a format names, when it still covers the language (a curated one or a published AI one). */
  private async formatTheme(
    format: StoryFormatData,
    language: Language,
  ): Promise<BookTheme | null> {
    if (!format.theme) return null;
    const curated = BOOK_THEMES[format.theme];
    if (curated) return curated.languages.includes(language) ? curated : null;
    return this.themes.pick(format.theme, language, { comic: true });
  }

  /**
   * About what the book will cost in model spend, from its format (every frame and sheet), so the
   * budget check refuses a book that would run past it rather than one picture a page.
   */
  async estimate(input: CreateBookInput): Promise<number> {
    try {
      const slug = input.template
        ? (await this.templates.find(input.template)).methodology
        : input.methodology;
      const method = slug ? await this.methodologies.find(slug) : undefined;
      const format = await this.formats.forBook(method?.format);
      return formatEstimate(format, {
        pages: this.pageCount,
        pet: !!input.child.pet?.trim(),
        toy: !!input.toy,
      }).usd;
    } catch {
      // An unknown template or method is refused by create() with its own message.
      return 0;
    }
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
    const pages = normalizePages(row.pages);
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
        ...(result.coverTone && { coverTone: json(result.coverTone) }),
      },
    });
  }

  /** Lays the book out, prints it and runs render QA; the result's layout records what QA did. */
  async renderPdf(
    row: BookRow,
    layout = layoutOf(row.layout),
    hooks: RenderHooks = {},
    place: PlaceOptions = { captions: true },
  ) {
    const book = storedBook(row);
    const labels = BOOK_LABELS[book.language];
    const checked = withHeadingCheck(layout, [
      book.title ?? '',
      book.childName,
      layout.dedication ?? labels.madeFor(book.childName),
      layout.photo?.caption ?? '',
      labels.talk,
      labels.end,
    ]);
    const stored = normalizePages(row.pages);
    // Picture book pages are judged as before (chooseLayout); panel pages get their texts placed.
    const pictures = stored
      .filter((p) => !isPanelPage(p))
      .map((p) => ({
        page: p.page,
        subject: p.frames[0]?.subject ?? null,
        tone: p.frames[0]?.tone ?? null,
      }));
    const frames = stored.filter(isPanelPage).flatMap((p) =>
      p.frames.map((f) => ({
        page: p.page,
        frame: f.frame,
        subject: f.subject ?? null,
        tone: f.tone ?? null,
      })),
    );
    const cover = row.coverImagePath
      ? {
          subject: PageSubjectSchema.safeParse(row.coverSubject).data ?? null,
          tone: PageToneSchema.safeParse(row.coverTone).data ?? null,
        }
      : null;
    const result = await this.journal.run({ bookId: row.id }, () =>
      this.journal.step('layout.check', {}, () =>
        this.pdf.render(
          row.id,
          book,
          checked,
          pictures,
          hooks,
          cover,
          frames,
          place,
        ),
      ),
    );
    // The tones are measured once and kept with the frames (the pages are saved in today's shape).
    const pages: StoredPage[] = stored.map((p) => ({
      ...p,
      frames: p.frames.map((f) => ({
        ...f,
        tone: result.tones[frameKey(p.page, f.frame)] ?? f.tone ?? null,
      })),
    }));
    return { ...result, pages };
  }

  /** A catalog book: its method, plot, art style and the parent's answers. */
  private async catalogJob(slug: string, input: CreateBookInput): Promise<Job> {
    const template = await this.templates.find(slug);
    const { child } = input;
    if (child.age < template.ageMin || child.age > template.ageMax) {
      throw new BadRequestException(
        `«${template.title}» - для возраста ${template.ageMin}–${template.ageMax} лет`,
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
          : `«${answer}» - нет такого варианта в вопросе «${question.label}»`,
      );
    }
    // A theme the template names, if it still covers the book's language; else by age.
    const named = template.layoutTheme
      ? await this.themes.pick(template.layoutTheme, child.language)
      : null;
    const blocks = TemplateBlocksSchema.safeParse(template.blocks);
    const methodology = await this.methodologies.forTemplate(
      template.methodology,
    );
    const format = await this.formats.forBook(methodology.format);
    return {
      theme:
        named ??
        (await this.formatTheme(format, child.language)) ??
        BOOK_THEMES[defaultThemeId(child.age)],
      blocks: blocks.success ? blocks.data : null,
      brief: {
        child,
        pageCount: format.pageCount ?? this.pageCount,
        methodology,
        format,
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
    {
      brief,
      style: templateStyle,
      toyUpload,
      theme,
      printFormat,
      heroPhoto: photoTrack,
    }: Job,
    spent: Spend,
  ): Promise<void> {
    const { child, format } = brief;
    // A catalog book's own style wins; else the format's (a comic's ink and flat colors); else the default.
    const style = templateStyle ?? format.artStyle ?? undefined;
    // Picture book pages leave calm space for text only when the theme first prints text over them.
    const textSpace = calmSpace(theme) ?? undefined;
    const inStep = <T>(
      step: PipelineStepId,
      task: () => Promise<T>,
      where: { page?: number; frame?: number } = {},
    ) => this.journal.step(step, where, task);

    // What the progress screen shows (Book.generation): the step, the pages being drawn or
    // redrawn. Pages finish in parallel, so every write goes through one queue in order, each with
    // the latest state.
    const gen = firstState(
      !!toyUpload,
      !!child.pet?.trim(),
      brief.pageCount,
      new Date(),
      expectedFrames(format, brief.pageCount),
      !!photoTrack,
    );
    gen.startedAt = gen.stepAt;
    let writes: Promise<unknown> = Promise.resolve();
    const save = (data: Prisma.BookUpdateInput = {}) => {
      const write = writes.then(() =>
        this.update(id, statusOfStep(gen.step), {
          ...data,
          generation: json(gen),
        }),
      );
      writes = write.catch(() => undefined);
      return write;
    };
    const step = (next: GenerationStep, data: Prisma.BookUpdateInput = {}) => {
      gen.step = next;
      gen.stepAt = new Date().toISOString();
      return save({ progress: progressFor(statusOfStep(next)), ...data });
    };
    await step('read');

    // The toy first: SAM cuts it out of the photo, Muse Spark puts it into words for the story.
    let toyReference: Buffer | null = null;
    if (toyUpload) {
      await step('toy');
      const photo = await this.storage.read(toyUploadPath(toyUpload));
      const toyPhotoPath = await this.storage.save(
        `books/${id}/toy-photo.jpg`,
        photo,
      );
      await this.storage.remove(toyUploadPath(toyUpload));
      const found = await inStep('toy.cutout', () =>
        this.models.findToy(photo),
      );
      toyReference = found.cutout ?? photo;
      const toyCutoutPath = found.cutout
        ? await this.storage.save(`books/${id}/toy-cutout.jpg`, found.cutout)
        : null;
      const described = await inStep('toy.describe', () =>
        this.models.describeToy(toyReference!),
      );
      spent.usd += found.costUsd + described.costUsd;
      const row = await save({
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

    // The photo path: Muse Spark describes the child's look from the photo (closed values only); the
    // story and the hero's sheet follow it. Any refusal or failure gives the photo up at once (it is
    // deleted) and the hero is drawn from the description: the book never fails because of the photo.
    let photo: Buffer | null = null;
    const giveUpPhoto = async (reason: PhotoFallback) => {
      photo = null;
      const record = photoTrack!.record;
      record.fallback = reason;
      const at = await this.heroPhotos.remove(
        photoTrack!.upload,
        `given up (${reason}); the hero is drawn from the description`,
        id,
      );
      record.deletedAt = (at ?? new Date()).toISOString();
      gen.photoDeletedAt = record.deletedAt;
      await save({ heroPhoto: json(record), heroSource: 'description' });
    };
    if (photoTrack) {
      await step('photo');
      photo =
        photoTrack.record.fallback === null
          ? await this.heroPhotos.read(photoTrack.upload)
          : null;
      if (!photo) await giveUpPhoto(photoTrack.record.fallback ?? 'missing');
      else {
        const sent: Buffer = photo;
        try {
          const described = await inStep('hero.describe', () =>
            this.models.describeChild(sent),
          );
          spent.usd += described.costUsd;
          brief = { ...brief, child: { ...brief.child, look: described.look } };
          photoTrack.record.describedAt = new Date().toISOString();
          await save({
            child: json(brief.child),
            heroPhoto: json(photoTrack.record),
            costUsd: spent.usd,
          });
        } catch (error) {
          this.logger.warn(
            `book ${id}: the photo was not described (${error instanceof Error ? error.message : String(error)}); drawing from the description`,
          );
          await giveUpPhoto(
            isSafetyRefusal(error) ? 'describe_refused' : 'describe_failed',
          );
        }
      }
    }

    await step('story');
    const { story, costUsd: storyCost } = await inStep('story.write', () =>
      this.models.writeStory(brief),
    );
    spent.usd += storyCost;
    // Each page as the format allows (its grids and kinds of text), with the method beat it tells:
    // Spark's tag, else spread over the beats in order.
    const beats = brief.methodology.structure.length;
    const pages: StoredPage[] = story.pages.map((p) =>
      storedPageFrom(
        p,
        format,
        beatOf(p.beat, p.page, story.pages.length, beats),
      ),
    );
    const cast: StoredCast[] = story.cast.map((member) => ({
      ...member,
      imagePath: null,
      responseId: null,
    }));
    // The side characters the format draws on sheets of their own: the first ones the story lists.
    const sheeted = cast
      .filter((c) => c.kind === 'character')
      .slice(0, format.castSheets);
    // Now it is known whether there is a pet to draw, how many pages, frames and cast sheets.
    gen.pet = story.pet_description !== null;
    gen.pages = pages.length;
    gen.frames = pages.reduce((n, p) => n + p.frames.length, 0);
    gen.cast = sheeted.length;
    await save({
      title: story.title,
      blurb: story.blurb,
      heroDescription: story.hero_description,
      pages: json(pages),
      cast: json(cast),
      talkQuestions: story.talk_questions,
      costUsd: spent.usd,
    });

    // A second pass before any picture is drawn: the parent's text went into the prompt.
    await step('review', { progress: 20 });
    const review = await inStep('story.review', () =>
      this.models.reviewStory(story, child.age, child.language),
    );
    spent.usd += review.costUsd;
    if (!review.safe) {
      throw new Error(
        `Сказка не прошла проверку безопасности: ${review.reason}`,
      );
    }

    // The illustrators' pictures for this theme and method (none: drawn as before).
    const references = await this.references.forBook({
      theme: theme.id,
      methodology: brief.methodology.slug,
    });

    await step('hero');
    const heroRefs = await references.for({ kind: 'hero' });
    // The look the parent picked (or Spark saw) is said again next to the story's description, so
    // the sheet every page copies has exactly those colours.
    const look = lookSentence(brief.child.look);
    const drawHero = (withPhoto?: { data: Buffer; look: string }) =>
      inStep('sheet.hero', () =>
        this.models.drawHero(
          look && !withPhoto
            ? `${story.hero_description.replace(/[.\s]+$/, '')}; exact look: ${look}`
            : story.hero_description,
          style,
          heroRefs,
          withPhoto,
        ),
      );
    let hero: GeneratedImage;
    const sendPhoto: Buffer | null = photo;
    if (photoTrack && sendPhoto) {
      // The photo's last use: the sheet is drawn with it as a reference, then it is deleted at once,
      // whatever the outcome; a refused or failed drawing is then drawn again from the description.
      const record = photoTrack.record;
      let drawn: GeneratedImage | null = null;
      try {
        drawn = await drawHero({ data: sendPhoto, look });
        record.drawnAt = new Date().toISOString();
      } catch (error) {
        this.logger.warn(
          `book ${id}: the hero was not drawn from the photo (${error instanceof Error ? error.message : String(error)}); drawing from the description`,
        );
        record.fallback = isSafetyRefusal(error)
          ? 'draw_refused'
          : 'draw_failed';
      } finally {
        photo = null;
        const at = await this.heroPhotos.remove(
          photoTrack.upload,
          record.fallback
            ? `given up (${record.fallback}); the hero is drawn from the description`
            : 'the hero sheet is drawn; later pictures chain from the sheet, never the photo',
          id,
        );
        record.deletedAt = (at ?? new Date()).toISOString();
        gen.photoDeletedAt = record.deletedAt;
        await save({
          heroPhoto: json(record),
          heroSource: record.fallback ? 'description' : 'photo',
        });
      }
      hero = drawn ?? (await drawHero());
    } else {
      hero = await drawHero();
    }
    spent.usd += hero.costUsd;
    const heroImagePath = await this.storage.save(
      `books/${id}/hero.${hero.ext}`,
      hero.data,
    );
    await save({
      heroResponseId: hero.ref,
      heroImagePath,
      costUsd: spent.usd,
    });

    // The pet gets its own sheet too, or it changes breed and color between pages.
    let anchorRef = hero.ref;
    const withPet = story.pet_description !== null;
    if (withPet || (toyReference && brief.toy) || sheeted.length)
      await step('friends', { progress: 28 });
    if (story.pet_description) {
      const description = story.pet_description;
      const pet = await inStep('sheet.pet', () =>
        this.models.drawPet(description, hero.ref, style),
      );
      spent.usd += pet.costUsd;
      const petImagePath = await this.storage.save(
        `books/${id}/pet.${pet.ext}`,
        pet.data,
      );
      anchorRef = pet.ref;
      await save({ petImagePath, costUsd: spent.usd });
    }

    // The toy's sheet is drawn from the cut-out photo, chained after the hero (and pet).
    if (toyReference && brief.toy) {
      const toyBrief = brief.toy;
      const after = anchorRef;
      const toy = await inStep('sheet.toy', () =>
        this.models.drawToy(toyBrief.description, toyReference, after, style),
      );
      spent.usd += toy.costUsd;
      const toyImagePath = await this.storage.save(
        `books/${id}/toy.${toy.ext}`,
        toy.data,
      );
      anchorRef = toy.ref;
      await save({ toyImagePath, costUsd: spent.usd });
    }

    // Side characters get sheets of their own, chained like the hero's, or their skin, hair and
    // clothes drift between panels; the frames then chain from the last sheet.
    for (const member of sheeted) {
      const after = anchorRef;
      const sheet = await inStep('sheet.cast', () =>
        this.models.drawCast(member.name, member.look, after, style),
      );
      spent.usd += sheet.costUsd;
      member.imagePath = await this.storage.save(
        `books/${id}/cast-${member.id}.${sheet.ext}`,
        sheet.data,
      );
      member.responseId = sheet.ref;
      anchorRef = sheet.ref;
      await save({ cast: json(cast), costUsd: spent.usd });
    }

    await step('pages', {
      progress: progressFor('pages', 0, gen.frames ?? pages.length),
    });
    // The cover is drawn alongside the pages, chained from the same sheets: it adds no wait of its own.
    const companions = (scene: string): Companions => ({
      pet: withPet && petInScene(scene),
      toy: toyReference !== null && toyInScene(scene),
    });
    // The cover names the cast like a frame does, so a kite or a friend looks as on the pages.
    const coverScene =
      story.cover_scene ?? pages[0]?.frames[0]?.scenePrompt ?? story.title;
    const coverCast = castIn(
      { cast: [], scenePrompt: coverScene },
      cast,
      sheeted,
    )
      .map((c) => ` ${c.name}: ${c.look.replace(/[.\s]+$/, '')}.`)
      .join('');
    const coverJob = this.drawCover(
      id,
      `${coverScene.replace(/[.\s]+$/, '')}.${coverCast}`,
      anchorRef,
      companions,
      style,
      references,
      spent,
    );
    const layoutFormat =
      printFormat ?? bookFormatOf(await this.reference.defaultFormat());
    // Frames of every page drawn at once share these slots; a page's frames all start together.
    const frameSlots = new Slots(FRAME_CONCURRENCY);
    let framesDone = 0;
    const settle = (n: number) => {
      gen.drawing = gen.drawing.filter((p) => p !== n);
      gen.redrawing = gen.redrawing.filter((p) => p !== n);
    };
    const drawFrame = async (page: StoredPage, frame: StoredFrame) => {
      const panel = isPanelPage(page);
      const box = frameBox(layoutFormat, frame.rect, format.gutterMm);
      const texts = page.texts.filter((t) => t.frame === frame.frame);
      const drawn = await frameSlots.run(async () =>
        illustrateFrame(this.models, {
          page: page.page,
          frame: frame.frame,
          text: panel ? texts.map((t) => t.text).join('\n') : pageProse(page),
          language: child.language,
          scene: frame.scenePrompt,
          anchorRef,
          companions,
          cast: castIn(frame, cast, sheeted),
          positions: positionsOf(frame, cast),
          style,
          textSpace: panel ? undefined : textSpace,
          direction: panel ? format.frameDirection : null,
          size: frameImageSize(box, panel),
          references: await references.for({
            kind: 'page',
            beat: page.beat ?? null,
          }),
          onRetry: () => {
            if (!gen.redrawing.includes(page.page))
              gen.redrawing.push(page.page);
            return save();
          },
          step: (stepId, task) =>
            inStep(stepId, task, { page: page.page, frame: frame.frame }),
        }),
      );
      spent.usd += drawn.costUsd;
      frame.art = drawn.outcome;
      const image = drawn.image;
      if (!image) {
        frame.imagePath = null;
        frame.subject = null;
        this.logger.warn(
          `book ${id} page ${page.page} frame ${frame.frame}: the picture was refused; the hero's sheet instead`,
        );
      } else {
        const name =
          frame.frame > 1
            ? `page-${page.page}-${frame.frame}`
            : `page-${page.page}`;
        frame.imagePath = await this.storage.save(
          `books/${id}/${name}.${image.ext}`,
          image.data,
        );
        // SAM finds the characters once, for the layout; the frame's texts decide what it looks
        // for (faces where a balloon must point at a head). A failure only costs the overlays.
        frame.subject = await inStep(
          'frame.mask',
          () =>
            this.findSubject(
              id,
              page.page,
              image,
              spent,
              samConceptsFor(texts.map((t) => t.kind)),
            ),
          { page: page.page, frame: frame.frame },
        );
      }
      framesDone++;
    };
    await eachLimit(pages, PAGE_CONCURRENCY, async (page) => {
      gen.drawing.push(page.page);
      await save();
      // A refused scene is softened, then rewritten; a frame refused every time keeps no picture.
      await Promise.all(page.frames.map((frame) => drawFrame(page, frame)));
      settle(page.page);
      await save({
        pages: json(pages),
        costUsd: spent.usd,
        progress: progressFor('pages', framesDone, gen.frames ?? pages.length),
      });
    });

    const cover = await coverJob;
    let row = await step('check', {
      pages: json(pages),
      costUsd: spent.usd,
      progress: progressFor('pdf'),
      ...(cover && {
        coverImagePath: cover.path,
        coverSubject: cover.subject ? json(cover.subject) : Prisma.DbNull,
      }),
    });
    // While Muse Spark may still shorten a line, a balloon left on a face stays a balloon (render QA
    // fails it); the last layout moves what still covers a face into a caption box.
    const shortening = { captions: false };
    let rendered = await this.renderPdf(
      row,
      layoutOf(row.layout),
      { printing: () => step('pdf', { progress: 97 }) },
      shortening,
    );
    // A balloon or caption that does not fit even at the smallest size, or that covers a face, is
    // shortened by Muse Spark (the one text, not the page) and the book laid out again.
    for (let round = 0; round < SHORTEN_ROUNDS; round++) {
      const shortened = await this.shortenOverflow(
        rendered.pages,
        rendered.layout,
        format,
        child.language,
        spent,
      );
      if (!shortened) break;
      row = await save({ pages: json(shortened), costUsd: spent.usd });
      rendered = await this.renderPdf(row, rendered.layout, {}, shortening);
    }
    if (rendered.layout.qa.issues.some((i) => i.kind === 'face'))
      rendered = await this.renderPdf(row, rendered.layout);
    await writes;
    await this.update(id, 'done', {
      pdfPath: rendered.pdfPath,
      layout: json(rendered.layout),
      pages: json(rendered.pages),
      costUsd: spent.usd,
      ...(rendered.coverTone && { coverTone: json(rendered.coverTone) }),
      progress: 100,
      generation: Prisma.DbNull,
    });
    this.logger.log(
      `book ${id} done: ${pages.length} pages, ${gen.frames} frames, $${spent.usd.toFixed(3)}`,
    );
  }

  /**
   * Shortens every text render QA found overflowing or covering a face on a panel page (each issue
   * names its element), to the format's limit for its kind or three quarters of its words. Returns
   * the pages with the new texts, or null when nothing was shortened. Picture book pages are left to
   * the layout.
   */
  async shortenOverflow(
    pages: StoredPage[],
    layout: BookLayout,
    format: Pick<StoryFormatData, 'textRules'>,
    language: Language,
    spent: Spend,
  ): Promise<StoredPage[] | null> {
    const issues = layout.qa.issues.filter(
      (i) => (i.kind === 'overflow' || i.kind === 'face') && i.element,
    );
    if (!issues.length) return null;
    const next = pages.map((p) => ({
      ...p,
      texts: p.texts.map((t) => ({ ...t })),
    }));
    let changed = false;
    for (const issue of issues) {
      const [page, element] = issue.element!.split(':');
      const text = next
        .find((p) => String(p.page) === page)
        ?.texts.find((t) => t.id === element);
      if (!text) continue;
      const limit = textRule(format, text.kind)?.maxWords ?? 12;
      const words = countWords(text.text);
      const short = await this.journal.step(
        'text.shorten',
        { page: Number(page) },
        () =>
          this.models.shortenText({
            language,
            kind: text.kind,
            text: text.text,
            maxWords: Math.max(1, Math.min(limit, Math.floor(words * 0.75))),
          }),
      );
      spent.usd += short.costUsd;
      if (short.text && short.text !== text.text) {
        text.text = short.text;
        changed = true;
      }
    }
    return changed ? next : null;
  }

  /**
   * The front cover's own illustration and SAM's mask of it. Never throws: a refused or failed cover
   * leaves the book with the older cover (the hero's sheet on the theme's sky), logged. A refused
   * scene is tried once more in its gentler form.
   */
  private async drawCover(
    id: string,
    scene: string,
    anchorRef: string,
    companions: (scene: string) => Companions,
    style: string | undefined,
    references: BookReferences,
    spent: Spend,
  ): Promise<{ path: string; subject: PageSubject | null } | null> {
    const pictures = await references.for({ kind: 'cover' });
    const draw = (text: string) =>
      this.journal.step('cover.draw', {}, () =>
        this.models.drawCover(
          text,
          anchorRef,
          companions(text),
          style,
          pictures,
        ),
      );
    try {
      let image: GeneratedImage;
      try {
        image = await draw(scene);
      } catch (error) {
        if (!isSafetyRefusal(error)) throw error;
        image = await draw(softenScene(scene));
      }
      spent.usd += image.costUsd;
      const path = await this.storage.save(
        `books/${id}/cover.${image.ext}`,
        image.data,
      );
      let subject: PageSubject | null = null;
      try {
        const found = await this.journal.step('cover.mask', {}, () =>
          this.models.findSubject(image.data, image.ext, 'cover-mask'),
        );
        spent.usd += found.costUsd;
        subject = found.subject;
      } catch (error) {
        this.logger.warn(
          `book ${id} cover: no mask (${error instanceof Error ? error.message : String(error)}); the lettering gets its own band`,
        );
      }
      return { path, subject };
    } catch (error) {
      this.logger.warn(
        `book ${id}: no cover illustration (${error instanceof Error ? error.message : String(error)}); the older cover instead`,
      );
      return null;
    }
  }

  /** SAM's mask of a frame's characters; null when SAM failed (logged). */
  private async findSubject(
    id: string,
    page: number,
    image: GeneratedImage,
    spent: Spend,
    concepts?: readonly SamConcept[],
  ): Promise<PageSubject | null> {
    try {
      const found = await this.models.findSubject(
        image.data,
        image.ext,
        'page-mask',
        concepts,
      );
      spent.usd += found.costUsd;
      return found.subject;
    } catch (error) {
      this.logger.warn(
        `book ${id} page ${page}: no hero mask (${error instanceof Error ? error.message : String(error)})`,
      );
      return null;
    }
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
    const pages = normalizePages(row.pages);
    return {
      id: row.id,
      status: row.status,
      progress: row.progress,
      title: row.title,
      language: row.language as Language,
      childName: (row.child as unknown as ChildProfile).name,
      methodology: row.methodology,
      format: row.storyFormat,
      template: row.template?.slug ?? null,
      talkQuestions: row.talkQuestions as string[],
      heroImageUrl: this.storage.url(row.heroImagePath),
      coverImageUrl: this.storage.url(row.coverImagePath),
      blurb: row.blurb,
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
        text: pageProse(p),
        imageUrl: this.storage.url(p.frames[0]?.imagePath ?? null),
        ...(p.frames[0]?.art === 'refused' && { vignette: true }),
        grid: p.grid,
        frames: p.frames.map((f) => ({
          frame: f.frame,
          rect: f.rect,
          imageUrl: this.storage.url(f.imagePath),
          ...(f.art === 'refused' && { vignette: true }),
        })),
        texts: p.texts.map((t) => ({
          id: t.id,
          kind: t.kind,
          frame: t.frame,
          speaker: t.speaker,
          text: t.text,
        })),
      })),
      pdfUrl: this.storage.url(row.pdfPath),
      error: row.error,
      layout: layoutOf(row.layout),
      editable,
      heroSource: row.heroSource === 'photo' ? 'photo' : 'description',
      heroPhoto: heroPhotoView(row.heroPhoto),
      generation: this.generationOf(row, pages),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * The progress screen's view while the book is being made (null once done or failed): its steps,
   * pages drawn, pages being drawn again, and about how long is left. A book without a stored state
   * (made before it) is read off its status.
   */
  generationOf(
    row: BookRow,
    pages: StoredPage[],
    now = Date.now(),
  ): GenerationView | null {
    if (row.status === 'done' || row.status === 'failed') return null;
    const stored = GenerationStateSchema.safeParse(row.generation);
    const state = stored.success
      ? stored.data
      : stateOfStatus(row.status, {
          toy: !!row.toyPhotoPath || row.status === 'toy',
          pet: !!row.petImagePath,
          pages: pages.length || this.pageCount,
          since: (row.updatedAt ?? row.createdAt).toISOString(),
        });
    const drawn = (f: StoredFrame) => !!f.imagePath || f.art === 'refused';
    return generationView(
      state,
      {
        pagesDone: pages.filter((p) => p.frames.every(drawn)).length,
        framesDone: pages.reduce(
          (n, p) => n + p.frames.filter(drawn).length,
          0,
        ),
        petImageUrl: this.storage.url(row.petImagePath),
      },
      this.timings.current(now),
      now,
    );
  }
}

/** The state a book starts with, before it leaves the queue. */
function firstState(
  toy: boolean,
  pet: boolean,
  pages: number,
  now: Date,
  frames = pages,
  photo = false,
): GenerationState {
  return {
    step: 'read',
    toy,
    photo,
    photoDeletedAt: null,
    pet,
    pages,
    frames,
    cast: 0,
    drawing: [],
    redrawing: [],
    startedAt: null,
    stepAt: now.toISOString(),
  };
}

/** What the renderer needs of a stored book; images by file name, as they sit next to book.html. */
export function storedBook(row: BookRow) {
  const child = row.child as unknown as ChildProfile;
  const things = new Set(
    (Array.isArray(row.cast) ? (row.cast as unknown as CastMember[]) : [])
      .filter((c) => c.kind === 'thing')
      .map((c) => c.id),
  );
  const local = (path: string | null) => (path ? basename(path) : null);
  return {
    title: row.title,
    childName: child.name,
    language: row.language as Language,
    heroImage: local(row.heroImagePath),
    coverImage: local(row.coverImagePath),
    blurb: row.blurb,
    pages: normalizePages(row.pages).map((p): RenderablePage => ({
      page: p.page,
      text: pageProse(p),
      image: local(p.frames[0]?.imagePath ?? null),
      frames: p.frames.map((f) => ({
        frame: f.frame,
        rect: f.rect,
        image: local(f.imagePath),
        // Who may speak: people and the pet, not the things the story keeps the same (a kite).
        cast: f.cast.filter((c) => !things.has(c.id)),
      })),
      texts: p.texts.map((t) => ({
        id: t.id,
        kind: t.kind,
        frame: t.frame,
        speaker: t.speaker,
        text: t.text,
      })),
    })),
    talkQuestions: row.talkQuestions as string[],
  };
}

/**
 * Pictures a book of this format draws for its pages, before the story says: the middle of its
 * grids' frame counts a page (one a page for a picture book).
 */
export function expectedFrames(
  format: Pick<StoryFormatData, 'grids'>,
  pages: number,
): number {
  const { min, max } = framesRange(format);
  return Math.round(pages * ((min + max) / 2));
}

/** The side characters and things a frame shows, with their looks (and whether they have a sheet). */
export function castIn(
  frame: Pick<StoredFrame, 'cast' | 'scenePrompt'>,
  cast: readonly CastMember[],
  sheeted: readonly CastMember[],
): CastInFrame[] {
  const scene = frame.scenePrompt.toLowerCase();
  return cast
    .filter(
      (member) =>
        frame.cast.some((c) => c.id === member.id) ||
        scene.includes(member.name.toLowerCase()),
    )
    .map((member) => ({
      name: member.name,
      look: member.look,
      kind: member.kind,
      sheet: sheeted.some((s) => s.id === member.id),
    }));
}

/** Where everyone stands in a frame, for the picture prompt: "the hero on the left, Ayla on the right". */
export function positionsOf(
  frame: Pick<StoredFrame, 'cast'>,
  cast: readonly CastMember[],
): string | undefined {
  const named = (id: string) =>
    id === 'hero' || id === 'pet' || id === 'toy'
      ? `the ${id}`
      : (cast.find((c) => c.id === id)?.name ?? null);
  const parts = frame.cast
    .filter((c) => c.at)
    .map((c) => {
      const name = named(c.id);
      return name
        ? `${name} ${c.at === 'center' ? 'in the middle' : `on the ${c.at}`}`
        : null;
    })
    .filter((p): p is string => p !== null);
  return parts.length > 1 ? parts.join(', ') : undefined;
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

/** The child's photo of a book being made: its upload id and the record kept on the book. */
interface PhotoTrack {
  upload: string;
  record: HeroPhotoRecord;
}

/** What the book's DTO says about the photo: when it was deleted and why it was not used; never the photo. */
function heroPhotoView(value: Prisma.JsonValue | null): Book['heroPhoto'] {
  const record = HeroPhotoRecordSchema.safeParse(value);
  return record.success
    ? { deletedAt: record.data.deletedAt, fallback: record.data.fallback }
    : null;
}

/** Runs at most `limit` tasks at once; the rest wait in order. */
export class Slots {
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
