import type { ConfigService } from '@nestjs/config';
import type { BooksService } from '../books/books.service';
import type { MethodologiesService } from '../methodologies/methodologies.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import type { SettingsService } from '../settings/settings.service';
import type { StorageService } from '../storage/storage.service';
import type { TemplatesService } from '../templates/templates.service';
import { AdminService } from './admin.service';

function makeService(prisma: unknown) {
  const books = { toDto: (row: { id: string }) => ({ id: row.id }) };
  return new AdminService(
    prisma as PrismaService,
    books as unknown as BooksService,
    {} as QuotaService,
    {} as SettingsService,
    {} as StorageService,
    {} as TemplatesService,
    {} as MethodologiesService,
    { get: () => 150 } as unknown as ConfigService,
  );
}

/** A book row with what AdminService.book reads besides the DTO. */
const row = (status: string, featured: boolean) => ({
  id: 'b1',
  status,
  featured,
  child: { name: 'Арман' },
  theme: null,
  answers: null,
  country: null,
  demo: false,
  costUsd: 0,
  clientKey: 'k',
});

describe('AdminService.setFeatured', () => {
  it('puts a finished book among the examples', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ status: 'done' })
      .mockResolvedValueOnce(row('done', true));
    const service = makeService({ book: { findUnique, update } });

    const book = await service.setFeatured('b1', true);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { featured: true },
    });
    expect(book.featured).toBe(true);
  });

  it('refuses a book that is not finished, but lets one be taken off', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce(row('failed', false));
    const service = makeService({ book: { findUnique, update } });

    await expect(service.setFeatured('b1', true)).rejects.toThrow(
      'только готовую книгу',
    );
    expect(update).not.toHaveBeenCalled();
    await service.setFeatured('b1', false);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { featured: false },
    });
  });

  it('says when the book does not exist', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      makeService({ book: { findUnique } }).setFeatured('nope', true),
    ).rejects.toThrow('book nope not found');
  });
});
