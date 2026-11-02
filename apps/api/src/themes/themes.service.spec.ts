import { UnprocessableEntityException } from '@nestjs/common';
import {
  LANGUAGES,
  ProposedThemeSchema,
  THEME_REFUSED,
  themeFromProposal,
  type ThemeCheck,
} from '@fabulka/shared';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { JournalService, NO_JOURNAL } from '../journal/journal.service';
import { MockGateway, mockTheme } from '../meta/mock.gateway';
import { PdfService } from '../pdf/pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ThemesService } from './themes.service';

describe('ThemesService.propose (Chromium)', () => {
  jest.setTimeout(120_000);
  let root: string;
  let themes: ThemesService;
  const created: Record<string, unknown>[] = [];

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fabulka-themes-'));
    const storage = {
      root,
      save: async (path: string, data: Buffer) => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), data);
        return path;
      },
      url: (path: string | null) => (path ? `/files/${path}` : null),
    } as unknown as StorageService;
    const journal = {
      run: <T>(_: unknown, task: () => Promise<T>) => task(),
      start: NO_JOURNAL.start,
    } as unknown as JournalService;
    const prisma = {
      theme: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({
            ...data,
            published: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        },
      },
    } as unknown as PrismaService;
    themes = new ThemesService(
      prisma,
      new MockGateway(0),
      new PdfService(storage, journal),
      storage,
      journal,
    );
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('checks a proposal, draws its ornament and renders a sample book in all five languages', async () => {
    const theme = await themes.propose('спокойный лес, 4–6 лет, зелёный');
    expect(theme.status).toBe('draft');
    expect(theme.theme).toMatchObject({
      source: 'ai',
      languages: ['en', 'kk', 'es', 'de', 'ru'],
      fonts: { body: { family: 'Literata' } },
    });
    expect(theme.checks.every((c) => c.ok)).toBe(true);
    expect(theme.checks.filter((c) => c.check === 'render')).toHaveLength(5);
    expect(Object.keys(theme.previews)).toEqual(['en', 'kk', 'es', 'de', 'ru']);
    const png = await readFile(
      join(root, theme.previews.kk![0].replace('/files/', '')),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(theme.theme.ornamentImage).toMatch(/ornament\.svg$/);
    expect(created).toHaveLength(1);
  });

  it('refuses a theme whose text would not read, saying which colors and why', async () => {
    const error = await themes
      .propose('бледная пастель, низкий контраст')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const body = (error as UnprocessableEntityException).getResponse() as {
      code: string;
      message: string;
      checks: ThemeCheck[];
    };
    expect(body.code).toBe(THEME_REFUSED);
    expect(body.message).toMatch(
      /contrast: ink #c9cfc0 on paper #f6f8ef: 1\.\d+, needs 7/,
    );
    expect(body.checks.find((c) => c.check === 'contrast')?.ok).toBe(false);
    expect(created).toHaveLength(1);
  });

  it('refuses fonts off the vetted list and sizes outside the age limits', async () => {
    const models = new MockGateway(0);
    jest.spyOn(models, 'proposeTheme').mockResolvedValue({
      proposal: {
        ...mockTheme(''),
        fonts: {
          heading: { family: 'Comic Sans MS', weight: 400 },
          body: { family: 'Lobster', weight: 400 },
        },
      },
      costUsd: 0,
    });
    const strict = new ThemesService(
      {} as PrismaService,
      models,
      {} as PdfService,
      {} as StorageService,
      {
        run: <T>(_: unknown, task: () => Promise<T>) => task(),
      } as unknown as JournalService,
    );
    const error = (await strict
      .propose('anything')
      .catch((e: unknown) => e)) as UnprocessableEntityException;
    expect(error.getResponse()).toMatchObject({ code: THEME_REFUSED });
    expect(error.message).toBeTruthy();
    const { message } = error.getResponse() as { message: string };
    expect(message).toMatch(/Comic Sans MS is not on the vetted list/);
    expect(message).toMatch(/Lobster is a display font/);
  });
});

describe('ThemesService.publish', () => {
  function setup() {
    const row = {
      id: 'ai-1',
      brief: 'лес',
      theme: mockThemeRow(),
      checks: [],
      previews: {},
      published: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      theme: {
        update: jest.fn(({ data }: { data: { published: boolean } }) =>
          Promise.resolve({ ...row, published: data.published }),
        ),
      },
      bookTemplate: {
        updateMany: jest.fn(() => Promise.resolve({ count: 2 })),
      },
    };
    const service = new ThemesService(
      prisma as unknown as PrismaService,
      new MockGateway(0),
      {} as PdfService,
      { url: (p: string) => `/files/${p}` } as unknown as StorageService,
      {} as JournalService,
    );
    return { service, prisma };
  }

  it('takes a theme back: catalog books that named it pick by age again', async () => {
    const { service, prisma } = setup();
    const theme = await service.publish('ai-1', false);
    expect(theme.status).toBe('draft');
    expect(prisma.bookTemplate.updateMany).toHaveBeenCalledWith({
      where: { layoutTheme: 'ai-1' },
      data: { layoutTheme: null },
    });
  });

  it('leaves catalog books alone when publishing', async () => {
    const { service, prisma } = setup();
    expect((await service.publish('ai-1', true)).status).toBe('published');
    expect(prisma.bookTemplate.updateMany).not.toHaveBeenCalled();
  });
});

/** A stored AI theme, as the mock proposes it, checked into a BookTheme. */
function mockThemeRow() {
  const theme = themeFromProposal(
    'ai-1',
    ProposedThemeSchema.parse(mockTheme('лес')),
  );
  return { ...theme, languages: [...LANGUAGES] };
}
