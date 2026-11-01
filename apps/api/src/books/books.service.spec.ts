import type { ConfigService } from '@nestjs/config';
import { DEFAULT_METHODOLOGIES, type BookLayout } from '@fabulka/shared';
import { MockGateway } from '../meta/mock.gateway';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { JournalService } from '../journal/journal.service';
import type { PdfService } from '../pdf/pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { SEED_TEMPLATES } from '../templates/catalog';
import { SEED_TRANSLATIONS } from '../templates/catalog-i18n';
import type { TemplatesService } from '../templates/templates.service';
import { BooksService, petInScene, toyInScene } from './books.service';

const child = {
  name: 'Арман',
  age: 5,
  gender: 'boy' as const,
  interests: ['футбол'],
  city: 'Астана',
  language: 'ru' as const,
};

const kindergarten = SEED_TEMPLATES.find(
  (t) => t.slug === 'first-day-kindergarten',
)!;

/** The seed methods as rows; `unpublished` ones are kept off the site. */
const methodRows = (unpublished: string[] = []) =>
  DEFAULT_METHODOLOGIES.map((m, i) => ({
    ...m,
    published: !unpublished.includes(m.slug),
    sortOrder: i,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

function makeService(
  prisma: unknown,
  models = new MockGateway(0),
  methods = methodRows(),
  template: Record<string, unknown> = {},
) {
  const templates = {
    find: jest.fn().mockResolvedValue({
      ...kindergarten,
      layoutTheme: null,
      ...template,
      stylePrompt: null,
      published: true,
      translations: SEED_TRANSLATIONS[kindergarten.slug],
    }),
  } as unknown as TemplatesService;
  return new BooksService(
    prisma as PrismaService,
    { url: () => null } as unknown as StorageService,
    {} as PdfService,
    templates,
    new MethodologiesService({
      methodology: { findMany: jest.fn().mockResolvedValue(methods) },
    } as unknown as PrismaService),
    models,
    new JournalService(prisma as PrismaService),
    { get: () => 2 } as unknown as ConfigService,
  );
}

describe('BooksService', () => {
  it('survives a book deleted while it is generating', async () => {
    const row = {
      id: 'b1',
      status: 'queued',
      child,
      language: 'ru',
      progress: 0,
      title: null,
      heroImagePath: null,
      pages: [],
      pdfPath: null,
      error: null,
      createdAt: new Date(),
    };
    const deleted = Object.assign(new Error('No record was found'), {
      code: 'P2025',
    });
    const updateMany = jest.fn().mockRejectedValue(deleted);
    const service = makeService({
      book: {
        create: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockRejectedValue(deleted),
        updateMany,
      },
    });
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    await service.create({ child }, 'k', false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    process.off('unhandledRejection', unhandled);
    expect(updateMany).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('fails books left unfinished by a restart', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    await makeService({ book: { updateMany } }).onModuleInit();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { notIn: ['done', 'failed'] } },
        data: expect.objectContaining({ status: 'failed' }) as unknown,
      }),
    );
  });

  it('stops before drawing when the story fails the safety review, keeping what it cost', async () => {
    const models = new MockGateway(0);
    const { story } = await models.writeStory({
      child,
      pageCount: 2,
      methodology: DEFAULT_METHODOLOGIES.find(
        (m) => m.slug === 'adventure-quest',
      )!,
    });
    jest
      .spyOn(models, 'writeStory')
      .mockResolvedValue({ story, costUsd: 0.02 });
    jest
      .spyOn(models, 'reviewStory')
      .mockResolvedValue({ safe: false, reason: 'too scary', costUsd: 0.001 });
    const drawHero = jest.spyOn(models, 'drawHero');
    const row = {
      id: 'b3',
      status: 'queued',
      child,
      language: 'ru',
      pages: [],
      createdAt: new Date(),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = makeService(
      {
        book: {
          create: jest.fn().mockResolvedValue(row),
          update: jest.fn().mockResolvedValue(row),
          updateMany,
        },
      },
      models,
    );

    await service.create({ child }, 'k', false);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(drawHero).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'b3' },
      data: {
        status: 'failed',
        error: 'Сказка не прошла проверку безопасности: too scary',
        costUsd: 0.021,
      },
    });
  });

  it('lists finished featured books as examples, newest first', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'b2',
        title: 'Арман и снежный барс',
        language: 'kk',
        heroImagePath: null,
      },
    ]);

    const examples = await makeService({ book: { findMany } }).listExamples();

    expect(findMany).toHaveBeenCalledWith({
      where: { featured: true, status: 'done', title: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    expect(examples).toEqual([
      {
        id: 'b2',
        title: 'Арман и снежный барс',
        language: 'kk',
        heroImageUrl: null,
      },
    ]);
  });

  describe('a book of your own', () => {
    /** Creates the book and returns what the story was written by; the story itself is skipped. */
    async function briefFor(
      input: { methodology?: string; age?: number },
      methods = methodRows(),
    ) {
      const models = new MockGateway(0);
      const writeStory = jest
        .spyOn(models, 'writeStory')
        .mockRejectedValue(new Error('stop after the story'));
      const create = jest
        .fn<
          Promise<unknown>,
          [{ data: { methodology: string; layout: BookLayout } }]
        >()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'b4',
            status: 'queued',
            child,
            language: 'ru',
            methodology: data.methodology,
            pages: [],
            createdAt: new Date(),
          }),
        );
      const service = makeService(
        { book: { create, update: jest.fn(), updateMany: jest.fn() } },
        models,
        methods,
      );
      const book = await service.create(
        {
          child: { ...child, age: input.age ?? child.age },
          methodology: input.methodology,
        },
        'k',
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        book,
        brief: writeStory.mock.calls[0][0],
        data: create.mock.calls[0][0].data,
      };
    }

    it('gives the book a theme by age and writes pages to fit its type', async () => {
      const young = await briefFor({ age: 3 });
      expect(young.data.layout.theme.id).toBe('little');
      expect(young.brief.wordsPerPage).toBe(25);
      const middle = await briefFor({ age: 6 });
      expect(middle.data.layout.theme.id).toBe('fairy');
      expect(middle.brief.wordsPerPage).toBe(50);
      expect(middle.data.layout.qa.status).toBe('pending');
    });

    it('follows the method the parent picked, with its beats from the database', async () => {
      const { book, brief } = await briefFor({ methodology: 'sel-emotions' });
      expect(book.methodology).toBe('sel-emotions');
      expect(brief.methodology.structure[0]).toContain('strong feeling');
    });

    it('picks a method by age when none is chosen', async () => {
      expect((await briefFor({ age: 3 })).book.methodology).toBe(
        'toddler-routine',
      );
      expect((await briefFor({ age: 7 })).book.methodology).toBe(
        'adventure-quest',
      );
      // The usual one is unpublished: the first published one that fits the age.
      const { book } = await briefFor(
        { age: 3 },
        methodRows(['toddler-routine']),
      );
      expect(book.methodology).toBe('social-story');
    });

    it('refuses an unknown or unpublished method, or one for other ages, with a code', async () => {
      const refusal = (code: string) =>
        expect.objectContaining({
          response: expect.objectContaining({ code }) as unknown,
        }) as unknown;
      await expect(briefFor({ methodology: 'no-such' })).rejects.toEqual(
        refusal('methodology_unknown'),
      );
      await expect(
        briefFor(
          { methodology: 'growth-mindset' },
          methodRows(['growth-mindset']),
        ),
      ).rejects.toEqual(refusal('methodology_unknown'));
      await expect(
        briefFor({ methodology: 'growth-mindset', age: 3 }),
      ).rejects.toThrow('для возраста 5–10 лет');
      await expect(
        briefFor({ methodology: 'growth-mindset', age: 3 }),
      ).rejects.toEqual(refusal('methodology_age'));
      await expect(
        briefFor({ age: 2 }, methodRows(['toddler-routine', 'social-story'])),
      ).rejects.toEqual(refusal('methodology_age'));
    });
  });

  describe('a catalog book', () => {
    const row = {
      id: 'b2',
      status: 'queued',
      child,
      language: 'ru',
      progress: 0,
      methodology: 'social-story',
      talkQuestions: [],
      template: { slug: kindergarten.slug },
      pages: [],
      createdAt: new Date(),
    };
    const answers = { toy: 'зайка', goodbye: 'машем в окно' };

    it('writes the story from its plot, method and the answers', async () => {
      const models = new MockGateway(0);
      const writeStory = jest
        .spyOn(models, 'writeStory')
        .mockRejectedValue(new Error('stop after the story'));
      const create = jest
        .fn<Promise<typeof row>, [{ data: unknown }]>()
        .mockResolvedValue(row);
      const service = makeService(
        {
          book: {
            create,
            update: jest.fn().mockResolvedValue(row),
            updateMany: jest.fn(),
          },
        },
        models,
      );

      const book = await service.create(
        { child, template: kindergarten.slug, answers },
        'k',
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(book.template).toBe(kindergarten.slug);
      expect(create.mock.calls[0][0].data).toMatchObject({
        methodology: 'social-story',
        answers,
        template: { connect: { slug: kindergarten.slug } },
      });
      const brief = writeStory.mock.calls[0][0];
      expect(brief.methodology.slug).toBe('social-story');
      expect(brief.methodology.source).toBe('Social Stories by Carol Gray');
      expect(brief.template?.plot).toEqual(kindergarten.plot);
      expect(brief.template?.answers).toEqual([
        { question: 'Какую игрушку возьмёт с собой?', answer: 'зайка' },
        { question: 'Как вы прощаетесь утром?', answer: 'машем в окно' },
      ]);
    });

    it('takes the theme the template names, else one by age', async () => {
      const themeOf = async (layoutTheme: string | null) => {
        const models = new MockGateway(0);
        jest.spyOn(models, 'writeStory').mockRejectedValue(new Error('stop'));
        const create = jest
          .fn<Promise<typeof row>, [{ data: { layout: BookLayout } }]>()
          .mockResolvedValue(row);
        const service = makeService(
          { book: { create, update: jest.fn(), updateMany: jest.fn() } },
          models,
          methodRows(),
          { layoutTheme },
        );
        await service.create(
          { child, template: kindergarten.slug, answers },
          'k',
          false,
        );
        return create.mock.calls[0][0].data.layout.theme.id;
      };
      expect(await themeOf('adventure')).toBe('adventure');
      expect(await themeOf(null)).toBe('fairy');
      // The legacy look is never given to a new book.
      expect(await themeOf('classic')).toBe('fairy');
    });

    it('accepts a choice made in the Kazakh interface', async () => {
      const models = new MockGateway(0);
      jest.spyOn(models, 'writeStory').mockRejectedValue(new Error('stop'));
      const service = makeService(
        {
          book: {
            create: jest.fn().mockResolvedValue(row),
            update: jest.fn().mockResolvedValue(row),
            updateMany: jest.fn(),
          },
        },
        models,
      );
      await expect(
        service.create(
          {
            child,
            template: kindergarten.slug,
            answers: { toy: 'қоян', goodbye: 'құшақтасамыз' },
          },
          'k',
          false,
        ),
      ).resolves.toBeDefined();
    });

    it('refuses a child outside its age range', async () => {
      const service = makeService({ book: {} });
      await expect(
        service.create(
          { child: { ...child, age: 9 }, template: kindergarten.slug, answers },
          'k',
          false,
        ),
      ).rejects.toThrow('для возраста 2–6 лет');
    });

    it('refuses a missing required answer or an unknown choice', async () => {
      const service = makeService({ book: {} });
      await expect(
        service.create(
          { child, template: kindergarten.slug, answers: { toy: 'зайка' } },
          'k',
          false,
        ),
      ).rejects.toThrow('Как вы прощаетесь утром?');
      await expect(
        service.create(
          {
            child,
            template: kindergarten.slug,
            answers: { ...answers, goodbye: 'кричим' },
          },
          'k',
          false,
        ),
      ).rejects.toThrow('нет такого варианта');
    });
  });
});

describe('petInScene', () => {
  it('draws the pet only where the scene names it', () => {
    expect(petInScene('the hero and the pet run in the park')).toBe(true);
    expect(petInScene('The pet sleeps at home')).toBe(true);
    expect(petInScene('the hero paints at a kindergarten table')).toBe(false);
    expect(petInScene('the hero sees a carpet')).toBe(false);
  });
});

describe('toyInScene', () => {
  it('draws the toy only where the scene names it', () => {
    expect(toyInScene('the hero hugs the toy')).toBe(true);
    expect(toyInScene('the hero sees a toyshop')).toBe(false);
  });
});
