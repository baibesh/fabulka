import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  COUNTRY_UNKNOWN,
  LANDING_IMAGE_MAX_BYTES,
  LANDING_IMAGE_WIDTHS,
  type CountryLanding,
  type LandingBook,
  type LandingImage,
  type LandingImageLanguage,
  type LandingImageSlot,
  type LandingImageUpload,
  type Language,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { referenceType } from '../references/references.service';
import { StorageService } from '../storage/storage.service';
import { ReferenceService } from './reference.service';

const MAX_PIXELS = 40_000_000;
/** How many finished books the picker lists. */
const BOOKS_LIMIT = 60;

/** 400 landing_bad_image: not a picture we can use (the admin shows its own words). */
export const LANDING_BAD_IMAGE = 'landing_bad_image';

function badImage(message: string) {
  return new BadRequestException({ code: LANDING_BAD_IMAGE, message });
}

/** The widths a square picture of `side` pixels is stored at: the standard ones it covers, at least one. */
export function widthsFor(side: number): number[] {
  const fit = LANDING_IMAGE_WIDTHS.filter((w) => w <= side);
  return fit.length ? [...fit] : [Math.max(16, Math.floor(side))];
}

/** Whether the bytes are an SVG document (the mock models draw books' pictures as SVG). */
function isSvg(data: Buffer): boolean {
  return /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(
    data.subarray(0, 512).toString('utf8'),
  );
}

/**
 * Square WebP files of a picture at widths (widthsFor), cropped to the square where the content is
 * (sharp's attention), on white: what the landing shows with srcset. 400 landing_bad_image for
 * anything but a JPEG, PNG or WebP (by its bytes) or a picture too large. `svg`: our own book
 * pictures may be SVG (drawn by the mock models), rendered to pixels here; never an upload.
 */
export async function squareVariants(
  data: Buffer,
  { svg = false }: { svg?: boolean } = {},
): Promise<{ width: number; data: Buffer }[]> {
  if (!referenceType(data) && !(svg && isSvg(data)))
    throw badImage('A JPEG, PNG or WebP picture');
  try {
    const source = sharp(data, { limitInputPixels: MAX_PIXELS }).rotate();
    const meta = await source.metadata();
    const side = Math.min(meta.width ?? 0, meta.height ?? 0);
    if (!side) throw new Error('no size');
    return await Promise.all(
      widthsFor(side).map(async (width) => ({
        width,
        data: await source
          .clone()
          .resize(width, width, { fit: 'cover', position: 'attention' })
          .flatten({ background: '#ffffff' })
          .webp({ quality: 82 })
          .toBuffer(),
      })),
    );
  } catch {
    throw badImage('The picture could not be read');
  }
}

/** The stored file of a book's picture: "cover", "hero" or "page-N". */
export function bookPicturePath(
  book: {
    coverImagePath: string | null;
    heroImagePath: string | null;
    pages: unknown;
  },
  picture: string,
): string | null {
  if (picture === 'cover') return book.coverImagePath;
  if (picture === 'hero') return book.heroImagePath;
  const page = /^page-(\d{1,2})$/.exec(picture)?.[1];
  if (!page || !Array.isArray(book.pages)) return null;
  const found = (book.pages as { page?: unknown; imagePath?: unknown }[]).find(
    (p) => p?.page === Number(page),
  );
  return typeof found?.imagePath === 'string' ? found.imagePath : null;
}

const bookSelect = {
  id: true,
  title: true,
  language: true,
  status: true,
  coverImagePath: true,
  heroImagePath: true,
  pages: true,
} as const;

/**
 * A country's landing pictures (admin Landing tab): set one slot × language from an upload or a
 * finished book's picture, or drop it so the default shows again. The files are made once (square
 * WebP at a few widths) under landing/<country>/; a replaced or dropped picture's files are removed.
 */
@Injectable()
export class LandingImagesService {
  private readonly logger = new Logger(LandingImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reference: ReferenceService,
  ) {}

  /**
   * Finished books staff may take a picture from: the examples' versions and the catalog samples
   * (this country's and the global ones), newest examples first.
   */
  async books(country: string): Promise<LandingBook[]> {
    const [versions, samples] = await Promise.all([
      this.prisma.exampleVersion.findMany({
        where: { book: { status: 'done' } },
        orderBy: { createdAt: 'desc' },
        take: BOOKS_LIMIT,
        select: { book: { select: bookSelect } },
      }),
      this.prisma.templateSample.findMany({
        where: { country: { in: [country, ''] }, book: { status: 'done' } },
        take: BOOKS_LIMIT,
        select: { book: { select: bookSelect } },
      }),
    ]);
    const seen = new Set<string>();
    const list: LandingBook[] = [];
    for (const [source, rows] of [
      ['example', versions],
      ['sample', samples],
    ] as const) {
      for (const { book } of rows) {
        if (seen.has(book.id) || list.length >= BOOKS_LIMIT) continue;
        seen.add(book.id);
        const pages = Array.isArray(book.pages)
          ? (book.pages as { page?: number }[])
              .map((p) => p?.page)
              .filter((n): n is number => typeof n === 'number')
          : [];
        const pictures = ['cover', 'hero', ...pages.map((n) => `page-${n}`)]
          .map((key) => ({ key, path: bookPicturePath(book, key) }))
          .filter((p): p is { key: string; path: string } => Boolean(p.path))
          .map(({ key, path }) => ({ key, url: this.storage.url(path)! }));
        if (!pictures.length) continue;
        list.push({
          id: book.id,
          title: book.title ?? '',
          language: book.language as Language,
          source,
          pictures,
        });
      }
    }
    return list;
  }

  /** Sets one slot's picture for a language ("all": every language of the country). */
  async set(
    country: string,
    body: LandingImageUpload,
  ): Promise<CountryLanding> {
    // Refused before any file is made (setLandingImages checks again).
    if (!(await this.reference.countries()).some((c) => c.code === country)) {
      throw new BadRequestException({
        code: COUNTRY_UNKNOWN,
        message: `${country} is not one of the countries the site offers`,
      });
    }
    const data = body.image
      ? decode(body.image)
      : await this.bookPicture(body.book!.id, body.book!.picture);
    const variants = await squareVariants(data, { svg: Boolean(body.book) });
    const base = `landing/${country}/${body.slot}-${randomBytes(8).toString('hex')}`;
    for (const variant of variants) {
      await this.storage.save(`${base}-${variant.width}.webp`, variant.data);
    }
    const image: LandingImage = {
      path: base,
      widths: variants.map((v) => v.width),
      ...(body.book && { book: body.book }),
    };
    const { landing } = await this.reference.admin();
    const images = structuredClone(landing[country]?.images ?? {});
    const old = images[body.slot]?.[body.language];
    images[body.slot] = { ...images[body.slot], [body.language]: image };
    const saved = await this.reference.setLandingImages(country, images);
    if (old) await this.removeFiles(old);
    return saved;
  }

  /** Drops one slot's picture for a language: the country's other picture or the default shows. */
  async remove(
    country: string,
    slot: LandingImageSlot,
    language: LandingImageLanguage,
  ): Promise<CountryLanding | null> {
    const { landing } = await this.reference.admin();
    const own = landing[country];
    const old = own?.images?.[slot]?.[language];
    if (!own || !old) return own ?? null;
    const images = structuredClone(own.images ?? {});
    const set = { ...images[slot] };
    delete set[language];
    if (Object.keys(set).length) images[slot] = set;
    else delete images[slot];
    const saved = await this.reference.setLandingImages(country, images);
    await this.removeFiles(old);
    return saved;
  }

  private async bookPicture(id: string, picture: string): Promise<Buffer> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      select: bookSelect,
    });
    const path =
      book?.status === 'done' ? bookPicturePath(book, picture) : null;
    if (!path) throw badImage('No such picture in a finished book');
    return this.storage.read(path).catch(() => {
      throw badImage('The picture file is missing');
    });
  }

  private async removeFiles(image: LandingImage): Promise<void> {
    for (const width of image.widths) {
      await this.storage
        .remove(`${image.path}-${width}.webp`)
        .catch((error: unknown) =>
          this.logger.warn(`could not remove ${image.path}: ${String(error)}`),
        );
    }
  }
}

function decode(url: string): Buffer {
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!bytes.length || bytes.length > LANDING_IMAGE_MAX_BYTES) {
    throw badImage(
      `A picture is at most ${LANDING_IMAGE_MAX_BYTES / 1024 / 1024} MB`,
    );
  }
  return bytes;
}
