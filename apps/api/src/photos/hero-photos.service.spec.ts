import { ConfigService } from '@nestjs/config';
import { CONSENT_OUTDATED } from '@fabulka/shared';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { ConsentService } from '../consent/consent.service';
import type { JournalService } from '../journal/journal.service';
import type { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { HERO_PHOTO_TTL_MS, HeroPhotosService } from './hero-photos.service';

interface Row {
  id: string;
  userId: string;
  path: string;
  consentVersion: number;
  consentLanguage: string;
  consentAt: Date;
  bookId: string | null;
  createdAt: Date;
}

function setup(currentVersion = 2) {
  const dir = mkdtempSync(join(tmpdir(), 'hero-photos-'));
  const storage = new StorageService(
    new ConfigService({ STORAGE_DIR: join(dir, 'public') }),
  );
  const rows = new Map<string, Row>();
  const heroPhoto = {
    create: jest.fn(
      ({ data }: { data: Omit<Row, 'consentAt' | 'createdAt' | 'bookId'> }) => {
        const row = {
          ...data,
          bookId: null,
          consentAt: new Date(),
          createdAt: new Date(),
        };
        rows.set(row.id, row);
        return Promise.resolve(row);
      },
    ),
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.get(where.id) ?? null),
    ),
    findMany: jest.fn(
      ({ where }: { where: { createdAt?: { lt: Date }; bookId?: unknown } }) =>
        Promise.resolve(
          [...rows.values()].filter((r) =>
            where.createdAt
              ? r.createdAt < where.createdAt.lt
              : r.bookId !== null,
          ),
        ),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; bookId: null };
        data: { bookId: string };
      }) => {
        const row = rows.get(where.id);
        if (!row || row.bookId !== null) return Promise.resolve({ count: 0 });
        row.bookId = data.bookId;
        return Promise.resolve({ count: 1 });
      },
    ),
    deleteMany: jest.fn(({ where }: { where: { id: string } }) => {
      rows.delete(where.id);
      return Promise.resolve({ count: 1 });
    }),
  };
  const journal = { record: jest.fn() };
  const consent = {
    isCurrent: (_language: string, version: number) =>
      Promise.resolve(version === currentVersion),
  };
  const photos = new HeroPhotosService(
    { heroPhoto } as unknown as PrismaService,
    storage,
    consent as unknown as ConsentService,
    journal as unknown as JournalService,
  );
  return { photos, rows, storage, journal };
}

const dataUrl = (data: Buffer) =>
  `data:image/jpeg;base64,${data.toString('base64')}`;

describe('HeroPhotosService', () => {
  const gps = readFileSync(join(__dirname, 'fixtures/child-gps.jpg'));

  it('keeps a small copy with no metadata outside the public files, with the consent given', async () => {
    const { photos, rows, storage } = setup();
    const { upload } = await photos.upload(
      {
        image: dataUrl(gps),
        consent: { version: 2, language: 'en', accepted: true },
      },
      'user-1',
    );
    expect(upload).toMatch(/^[a-f0-9]{32}$/);
    const row = rows.get(upload)!;
    expect(row).toMatchObject({
      userId: 'user-1',
      consentVersion: 2,
      consentLanguage: 'en',
      path: `hero-photos/${upload}.jpg`,
    });
    expect(await storage.exists(row.path)).toBe(false);
    const stored = await storage.readPrivate(row.path);
    const meta = await sharp(stored).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(1024);
    expect(meta.exif).toBeUndefined();
    expect(storage.privateRoot.startsWith(storage.root + '/')).toBe(false);
  });

  it('refuses a photo sent with an outdated consent, storing nothing', async () => {
    const { photos, rows } = setup(3);
    await expect(
      photos.upload(
        {
          image: dataUrl(gps),
          consent: { version: 2, language: 'en', accepted: true },
        },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { code: CONSENT_OUTDATED } });
    expect(rows.size).toBe(0);
  });

  it("hands the photo to one book of its own parent's only", async () => {
    const { photos } = setup();
    const { upload } = await photos.upload(
      {
        image: dataUrl(gps),
        consent: { version: 2, language: 'en', accepted: true },
      },
      'user-1',
    );
    await expect(photos.consentOf(upload, 'user-2')).rejects.toThrow(
      'upload it again',
    );
    expect((await photos.consentOf(upload, 'user-1')).consent).toMatchObject({
      version: 2,
      language: 'en',
    });
    expect(await photos.claim(upload, 'b1')).toBe(true);
    expect(await photos.claim(upload, 'b2')).toBe(false);
    await expect(photos.consentOf(upload, 'user-1')).rejects.toThrow(
      'upload it again',
    );
  });

  it('deletes the file and the row, records when in the journal, and finds nothing the second time', async () => {
    const { photos, rows, storage, journal } = setup();
    const { upload } = await photos.upload(
      {
        image: dataUrl(gps),
        consent: { version: 2, language: 'en', accepted: true },
      },
      'user-1',
    );
    await photos.claim(upload, 'b1');
    const at = await photos.remove(upload, 'the hero sheet is drawn', 'b1');
    expect(at).toBeInstanceOf(Date);
    expect(rows.has(upload)).toBe(false);
    expect(await storage.existsPrivate(`hero-photos/${upload}.jpg`)).toBe(
      false,
    );
    expect(await photos.exists(upload)).toEqual({ file: false, row: false });
    expect(await photos.read(upload)).toBeNull();
    expect(journal.record).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: 'b1',
        kind: 'photo-delete',
        status: 'ok',
        costUsd: 0,
        createdAt: at,
      }),
    );
    const [row] = journal.record.mock.calls[0] as [{ output: string }];
    expect(row.output).toContain(at!.toISOString());
    expect(await photos.remove(upload, 'again', 'b1')).toBeNull();
    expect(journal.record).toHaveBeenCalledTimes(1);
  });

  it('sweeps photos older than the TTL and those of books cut off by a restart', async () => {
    const { photos, rows } = setup();
    const consent = {
      version: 2,
      language: 'en' as const,
      accepted: true as const,
    };
    const old = (await photos.upload({ image: dataUrl(gps), consent }, 'u'))
      .upload;
    const taken = (await photos.upload({ image: dataUrl(gps), consent }, 'u'))
      .upload;
    const fresh = (await photos.upload({ image: dataUrl(gps), consent }, 'u'))
      .upload;
    rows.get(old)!.createdAt = new Date(Date.now() - HERO_PHOTO_TTL_MS - 1000);
    await photos.claim(taken, 'b1');
    expect(await photos.sweep()).toBe(1);
    expect(await photos.dropClaimed()).toBe(1);
    expect([...rows.keys()]).toEqual([fresh]);
  });
});
