import { DEFAULT_CONSENT, type ConsentClause } from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { ConsentService, HERO_PHOTO_CONSENT } from './consent.service';

interface Row {
  id: string;
  key: string;
  language: string;
  version: number;
  clauses: unknown;
  createdBy: string | null;
  createdAt: Date;
}

/** The ConsentText table in memory, with just the queries the service makes. */
function fakePrisma(rows: Row[] = []) {
  const newest = (where: { key: string; language?: string }) =>
    rows
      .filter(
        (r) =>
          r.key === where.key &&
          (where.language === undefined || r.language === where.language),
      )
      .sort((a, b) => b.version - a.version);
  const consentText = {
    findMany: jest.fn(({ where }: { where: { key: string } }) =>
      Promise.resolve(newest(where)),
    ),
    findFirst: jest.fn(
      ({ where }: { where: { key: string; language: string } }) =>
        Promise.resolve(newest(where)[0] ?? null),
    ),
    createMany: jest.fn(
      ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'createdBy'>[] }) => {
        for (const row of data)
          rows.push({
            ...row,
            id: `c${rows.length}`,
            createdBy: null,
            createdAt: new Date(),
          });
        return Promise.resolve({ count: data.length });
      },
    ),
    create: jest.fn(({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row = { ...data, id: `c${rows.length}`, createdAt: new Date() };
      rows.push(row);
      return Promise.resolve(row);
    }),
  };
  return { rows, prisma: { consentText } as unknown as PrismaService };
}

describe('ConsentService', () => {
  it('seeds version 1 of every language once', async () => {
    const { rows, prisma } = fakePrisma();
    const consent = new ConsentService(prisma);
    await consent.seed();
    await consent.seed();
    expect(rows).toHaveLength(5);
    expect(
      rows.every((r) => r.version === 1 && r.key === HERO_PHOTO_CONSENT),
    ).toBe(true);
    expect((await consent.current('de')).clauses).toEqual(DEFAULT_CONSENT.de);
  });

  it('makes a new version on every change, keeps the old ones, and adds none for the same text', async () => {
    const { rows, prisma } = fakePrisma();
    const consent = new ConsentService(prisma);
    await consent.seed();
    const edited: ConsentClause[] = [
      {
        ...DEFAULT_CONSENT.en[0],
        text: 'The photo goes to Meta once, then it is deleted.',
      },
      ...DEFAULT_CONSENT.en.slice(1),
    ];
    const first = await consent.save('en', edited, 'owner@fabulka.test');
    expect(first).toMatchObject({
      changed: true,
      before: { version: 1 },
      after: { version: 2, createdBy: 'owner@fabulka.test' },
    });
    expect((await consent.current('en')).clauses[0].text).toBe(
      'The photo goes to Meta once, then it is deleted.',
    );
    expect(await consent.isCurrent('en', 2)).toBe(true);
    expect(await consent.isCurrent('en', 1)).toBe(false);
    // Other languages keep their own versions.
    expect(await consent.isCurrent('ru', 1)).toBe(true);

    const again = await consent.save('en', edited, 'owner@fabulka.test');
    expect(again.changed).toBe(false);
    expect(rows.filter((r) => r.language === 'en')).toHaveLength(2);

    const admin = await consent.admin();
    const en = admin.languages.find((l) => l.language === 'en')!;
    expect(en.current.version).toBe(2);
    expect(en.history.map((v) => v.version)).toEqual([2, 1]);
  });

  it('falls back to English when a language has no text yet, which is never the current one for it', async () => {
    const { prisma } = fakePrisma();
    const consent = new ConsentService(prisma);
    await prisma.consentText.create({
      data: {
        key: HERO_PHOTO_CONSENT,
        language: 'en',
        version: 4,
        clauses: DEFAULT_CONSENT.en,
        createdBy: null,
      },
    });
    const kk = await consent.current('kk');
    expect(kk).toMatchObject({ language: 'en', version: 4 });
    expect(await consent.isCurrent('kk', 4)).toBe(false);
  });
});
