import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LANGUAGES,
  ProposedThemeSchema,
  THEME_REFUSED,
  editOf,
  themeFromProposal,
  type BookTheme,
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
      themeHistory: { create: () => Promise.resolve({}) },
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

/** Every check of a theme that passed them all, the sample book included. */
const PASSED: ThemeCheck[] = [
  { check: 'schema', ok: true, detail: 'valid theme JSON' },
  { check: 'contrast', ok: true, detail: 'all text pairs readable' },
  { check: 'render', ok: true, detail: 'everything fits', language: 'ru' },
];

/** A stored theme row and a service over an in-memory Theme table (no renderer). */
function stored(overrides: Record<string, unknown> = {}) {
  let row: Record<string, unknown> = {
    id: 'ai-1',
    brief: 'лес',
    theme: mockThemeRow(),
    checks: PASSED,
    previews: {},
    draft: null,
    basedOn: null,
    published: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const history: Record<string, unknown>[] = [];
  const prisma = {
    theme: {
      findUnique: jest.fn(() => Promise.resolve(row)),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const next = { ...row, ...data };
        // Prisma.DbNull clears a JSON column.
        const draft = data.draft;
        if (typeof draft === 'object' && draft !== null && !('theme' in draft))
          next.draft = null;
        row = next;
        return Promise.resolve(row);
      }),
    },
    themeHistory: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        history.push(data);
        return Promise.resolve(data);
      }),
    },
    bookTemplate: {
      updateMany: jest.fn(() => Promise.resolve({ count: 2 })),
    },
  };
  const service = new ThemesService(
    prisma as unknown as PrismaService,
    new MockGateway(0),
    {} as PdfService,
    {
      root: join(tmpdir(), 'fabulka-themes-none'),
      url: (p: string) => `/files/${p}`,
      exists: () => Promise.resolve(false),
    } as unknown as StorageService,
    {
      run: <T>(_: unknown, task: () => Promise<T>) => task(),
    } as unknown as JournalService,
  );
  return { service, prisma, history, row: () => row };
}

describe('ThemesService.publish', () => {
  it('takes a theme back: catalog books that named it pick by age again', async () => {
    const { service, prisma } = stored();
    const { entry } = await service.publish('ai-1', false);
    expect(entry.status).toBe('draft');
    expect(prisma.bookTemplate.updateMany).toHaveBeenCalledWith({
      where: { layoutTheme: 'ai-1' },
      data: { layoutTheme: null },
    });
  });

  it('leaves catalog books alone when publishing, and remembers it', async () => {
    const { service, prisma, history } = stored({ published: false });
    const { entry } = await service.publish('ai-1', true, 'owner@e2e.test');
    expect(entry.status).toBe('published');
    expect(prisma.bookTemplate.updateMany).not.toHaveBeenCalled();
    expect(history).toMatchObject([
      { themeId: 'ai-1', action: 'publish', who: 'owner@e2e.test' },
    ]);
  });

  it('never publishes a theme that failed a check', async () => {
    const failed: ThemeCheck[] = [
      { check: 'contrast', ok: false, detail: 'ink on paper: 1.6, needs 7' },
    ];
    const { service, prisma } = stored({ published: false, checks: failed });
    const error = (await service
      .publish('ai-1', true)
      .catch((e: unknown) => e)) as UnprocessableEntityException;
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({ code: THEME_REFUSED });
    expect(prisma.theme.update).not.toHaveBeenCalled();
  });
});

describe('ThemesService editing', () => {
  const edit = () => editOf(mockThemeRow());

  it('keeps a published theme as it is and holds a failing edit as pending changes', async () => {
    const { service, row, history } = stored();
    const pale = {
      ...edit(),
      palette: { ...edit().palette, ink: '#c9cfc0' },
    };
    const { entry, before, after } = await service.save('ai-1', pale, null);
    // What books and pickers use has not changed.
    expect(entry.theme.palette.ink).toBe('#22331f');
    expect(entry.status).toBe('published');
    expect(entry.draft?.theme.palette.ink).toBe('#c9cfc0');
    expect(entry.draft?.theme.version).toBe(2);
    const contrast = entry.draft?.checks.find((c) => c.check === 'contrast');
    expect(contrast).toMatchObject({ ok: false });
    expect(contrast?.detail).toMatch(/ink #c9cfc0 on paper/);
    const render = entry.draft?.checks.find((c) => c.check === 'render');
    expect(render?.ok).toBe(false);
    expect(render?.detail).toMatch(/not run/);
    expect(before?.palette.ink).toBe('#22331f');
    expect(after.palette.ink).toBe('#c9cfc0');
    expect(history.map((h) => h.action)).toEqual(['save']);
    // Pending changes that failed a check are not published.
    await expect(service.publish('ai-1', true)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect((row().theme as BookTheme).palette.ink).toBe('#22331f');
    // Dropped: the published version stays.
    const dropped = await service.discard('ai-1', null);
    expect(dropped.entry.draft).toBeNull();
    expect(dropped.entry.theme.palette.ink).toBe('#22331f');
  });

  it('refuses an ornament that is not this theme’s own file', async () => {
    const { service } = stored();
    await expect(
      service.save(
        'ai-1',
        { ...edit(), ornamentImage: 'themes/ai-2/ornament.png' },
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save(
        'ai-1',
        { ...edit(), ornamentImage: 'themes/ai-1/../ai-2/ornament.png' },
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refines with words through the propose call and says what changed, saving nothing', async () => {
    const { service, prisma } = stored();
    const refined = await service.refine(
      'ai-1',
      'warmer paper, bolder titles',
      edit(),
    );
    const paths = refined.changes.map((c) => c.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'palette.paper',
        'palette.plate',
        'fonts.heading.family',
      ]),
    );
    expect(paths).not.toContain('palette.ink');
    expect(refined.theme.fonts.heading).toEqual({
      family: 'Rubik',
      weight: 700,
    });
    expect(refined.checks.find((c) => c.check === 'contrast')?.ok).toBe(true);
    expect(refined.checks.filter((c) => c.check === 'glyphs')).toHaveLength(5);
    expect(prisma.theme.update).not.toHaveBeenCalled();
  });

  it('checks the editor’s fields without saving: a display body font and missing letters', () => {
    const { service } = stored();
    const checks = service.check({
      ...edit(),
      fonts: {
        heading: { family: 'Lobster', weight: 400 },
        body: { family: 'Lobster', weight: 400 },
      },
    });
    const fonts = checks.find((c) => c.check === 'fonts');
    expect(fonts?.ok).toBe(false);
    expect(fonts?.detail).toMatch(/Lobster is a display font/);
    const fine = service.check(edit());
    expect(fine.every((c) => c.ok)).toBe(true);
  });

  it('checks the comic lettering font too: vetted, and then its letters in every language', () => {
    const { service } = stored();
    const odd = service.check({
      ...edit(),
      lettering: { font: { family: 'Bangers', weight: 400 }, scale: 0.8 },
    });
    const fonts = odd.find((c) => c.check === 'fonts');
    expect(fonts?.ok).toBe(false);
    expect(fonts?.detail).toMatch(/lettering font Bangers/);
    expect(odd.filter((c) => c.check === 'glyphs').every((c) => !c.ok)).toBe(
      true,
    );
    const comic = service.check({
      ...edit(),
      lettering: { font: { family: 'Nunito', weight: 800 }, scale: 0.74 },
    });
    expect(comic.every((c) => c.ok)).toBe(true);
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
