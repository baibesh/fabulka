import { DEFAULT_METHODOLOGIES, DEFAULT_STORY_FORMATS } from '@fabulka/shared';
import type { Prisma } from '@prisma/client';
import { MetaGateway } from '../meta/meta.gateway';
import { MockGateway } from '../meta/mock.gateway';
import type { TranslationBrief } from '../meta/prompts';
import type { PrismaService } from '../prisma/prisma.service';
import { errorCode, JournalService } from './journal.service';

type Row = Prisma.ModelCallUncheckedCreateInput;

/** A journal over a fake Prisma that keeps the rows it was given. */
function makeJournal(create = jest.fn().mockResolvedValue({})) {
  const prisma = {
    modelCall: {
      create,
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    clientError: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const journal = new JournalService(prisma as unknown as PrismaService);
  const rows = () =>
    create.mock.calls.map(([args]: [{ data: Row }]) => args.data);
  return { journal, prisma, rows };
}

const translationBrief: TranslationBrief = {
  from: 'ru',
  to: 'de',
  child: { name: 'Алия', age: 5, gender: 'girl', city: 'Алматы' },
  toyName: null,
  title: 'Алия',
  pages: [
    {
      page: 1,
      texts: [{ id: '1.1', kind: 'narration', text: 'Жила-была Алия.' }],
    },
  ],
  talkQuestions: ['Что случилось?'],
  dedication: null,
  photoCaption: null,
  wordsPerPage: 40,
};

const brief = {
  child: {
    name: 'Алия',
    age: 5,
    gender: 'girl' as const,
    interests: ['динозавры'],
    city: 'Алматы',
    language: 'ru' as const,
  },
  pageCount: 1,
  methodology: DEFAULT_METHODOLOGIES.find((m) => m.slug === 'adventure-quest')!,
  format: DEFAULT_STORY_FORMATS[0],
};

describe('JournalService', () => {
  it('records a successful call without its prompt', async () => {
    const { journal, rows } = makeJournal();
    const call = journal.start({
      kind: 'story',
      model: 'muse-spark-1.3',
      prompt: 'Write a story about Алия',
    });
    call.ok({
      costUsd: 0.002,
      inputTokens: 900,
      outputTokens: 300,
      responseId: 'resp_1',
    });
    await journal.idle();

    expect(rows()).toEqual([
      expect.objectContaining({
        kind: 'story',
        model: 'muse-spark-1.3',
        status: 'ok',
        attempt: 1,
        inputTokens: 900,
        outputTokens: 300,
        images: 0,
        costUsd: 0.002,
        responseId: 'resp_1',
        bookId: null,
      }),
    ]);
    expect(rows()[0].prompt).toBeUndefined();
    expect(rows()[0].output).toBeUndefined();
    expect(rows()[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps the prompt and output of a failed call, cut to size', async () => {
    const { journal, rows } = makeJournal();
    const call = journal.start({
      kind: 'page',
      model: 'muse-image-1.0',
      prompt: 'p'.repeat(20_000),
      attempt: 2,
    });
    call.fail(new Error('x'.repeat(5000)), {
      code: 'no_image',
      output: 'o'.repeat(20_000),
    });
    // Only the first outcome counts.
    call.ok({ costUsd: 1 });
    await journal.idle();

    expect(rows()).toHaveLength(1);
    const row = rows()[0];
    expect(row).toMatchObject({
      status: 'error',
      attempt: 2,
      errorCode: 'no_image',
      costUsd: 0,
    });
    expect(row.errorMessage).toHaveLength(1000);
    expect(row.prompt).toHaveLength(8000);
    expect(row.output).toHaveLength(8000);
  });

  it('records a thrown request as failed and passes the error on', async () => {
    const { journal, rows } = makeJournal();
    const call = journal.start({ kind: 'hero', model: 'muse-image-1.0' });
    const refused = Object.assign(new Error('Too many requests'), {
      status: 429,
    });

    await expect(call.request(Promise.reject(refused))).rejects.toBe(refused);
    await journal.idle();

    expect(rows()[0]).toMatchObject({
      status: 'error',
      errorCode: 'http_429',
      errorMessage: 'Too many requests',
      prompt: null,
    });
  });

  it('never throws when the row cannot be stored', async () => {
    const { journal } = makeJournal(
      jest.fn().mockRejectedValue(new Error('db down')),
    );
    const broken = makeJournal(
      jest.fn(() => {
        throw new Error('sync failure');
      }),
    ).journal;

    expect(() =>
      journal.start({ kind: 'story', model: 'm' }).ok({ costUsd: 0 }),
    ).not.toThrow();
    expect(() =>
      broken.start({ kind: 'story', model: 'm' }).ok({ costUsd: 0 }),
    ).not.toThrow();
    await expect(journal.idle()).resolves.toBeUndefined();
  });

  it('records calls made inside run() against the book', async () => {
    const { journal, rows } = makeJournal();
    const models = new MockGateway(0, journal);

    await journal.run({ bookId: 'book-1' }, async () => {
      await models.writeStory(brief);
      await models.drawHero();
    });
    await models.transcribe();
    await journal.idle();

    expect(rows().map((r) => [r.kind, r.bookId, r.images])).toEqual([
      ['story', 'book-1', 0],
      ['hero', 'book-1', 1],
      ['voice-transcribe', null, 0],
    ]);
  });

  it('records the pipeline step, page and frame of calls made inside step()', async () => {
    const { journal, rows } = makeJournal();
    const models = new MockGateway(0, journal);

    await journal.run({ bookId: 'book-3' }, async () => {
      await journal.step('story.write', {}, () => models.writeStory(brief));
      await journal.step('frame.draw', { page: 2, frame: 3 }, () =>
        models.drawFrame({ scene: 'the hero, scene 2 frame 3' }),
      );
    });
    await journal.idle();

    expect(
      rows().map((r) => [r.kind, r.bookId, r.step, r.page, r.frame]),
    ).toEqual([
      ['story', 'book-3', 'story.write', null, null],
      ['page', 'book-3', 'frame.draw', 2, 3],
    ]);
  });

  it("records a staff action's calls against the staff email and country", async () => {
    const { journal, rows } = makeJournal();
    const models = new MockGateway(0, journal, 0.02);

    await journal.run(
      { bookId: 'book-2', staffEmail: 'cm@e2e.test', staffCountry: 'DE' },
      () => models.translateBook(translationBrief),
    );
    await models.writeStory(brief);
    await journal.idle();

    expect(
      rows().map((r) => [r.kind, r.staffEmail, r.staffCountry, r.costUsd]),
    ).toEqual([
      ['translate', 'cm@e2e.test', 'DE', 0.02],
      ['story', null, null, 0],
    ]);
  });

  it('records each of our own story retries with the invalid output', async () => {
    const { journal, rows } = makeJournal();
    const gateway = new MetaGateway(
      {
        apiKey: 'test',
        baseURL: 'http://localhost:1',
        storyModel: 'muse-spark-1.3',
        imageModel: 'muse-image-1.0',
        samModel: 'sam-3.1',
      },
      journal,
    );
    const { story } = await new MockGateway(0).writeStory(brief);
    const usage = { input_tokens: 1000, output_tokens: 200 };
    const create = jest
      .fn()
      .mockResolvedValueOnce({ id: 'r1', output_text: '{"title":', usage })
      .mockResolvedValueOnce({
        id: 'r2',
        output_text: JSON.stringify(story),
        usage,
      });
    (gateway as unknown as { client: unknown }).client = {
      responses: { create },
    };

    await gateway.writeStory(brief);
    await journal.idle();

    expect(rows()).toEqual([
      expect.objectContaining({
        kind: 'story',
        status: 'error',
        attempt: 1,
        errorCode: 'invalid_output',
        output: '{"title":',
        responseId: 'r1',
        inputTokens: 1000,
      }),
      expect.objectContaining({ status: 'ok', attempt: 2, responseId: 'r2' }),
    ]);
    expect(rows()[0].prompt).toContain('Алия');
    expect(rows()[0].costUsd).toBeCloseTo((1000 * 1.25 + 200 * 4.25) / 1e6);
    expect(rows()[1].prompt).toBeUndefined();
  });

  it('forgets prompts after 30 days and deletes rows after 90', async () => {
    const { journal, prisma } = makeJournal();
    const now = new Date('2026-10-31T00:00:00Z');

    const result = await journal.prune(now);

    expect(result).toEqual({ texts: 2, calls: 3, errors: 1 });
    expect(prisma.modelCall.updateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-10-01T00:00:00Z') },
        OR: [{ prompt: { not: null } }, { output: { not: null } }],
      },
      data: { prompt: null, output: null },
    });
    expect(prisma.modelCall.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-02T00:00:00Z') } },
    });
    expect(prisma.clientError.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-02T00:00:00Z') } },
    });
  });

  it('stores a browser error with a short user agent and no client key', async () => {
    const { journal, prisma } = makeJournal();
    journal.recordClientError(
      { kind: 'api', message: 'Server error', path: '/create', status: 500 },
      'u'.repeat(300),
    );
    await journal.idle();

    const [[{ data }]] = prisma.clientError.create.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(data).toMatchObject({ kind: 'api', path: '/create', status: 500 });
    expect(data.userAgent).toHaveLength(200);
    expect(Object.keys(data)).not.toContain('clientKey');
  });
});

describe('errorCode', () => {
  it('names the HTTP status, timeouts and unreadable output', () => {
    expect(errorCode(Object.assign(new Error(), { status: 503 }))).toBe(
      'http_503',
    );
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(errorCode(timeout)).toBe('timeout');
    expect(errorCode(new SyntaxError('Unexpected end of JSON'))).toBe(
      'invalid_output',
    );
    expect(errorCode('weird')).toBe('error');
  });
});
