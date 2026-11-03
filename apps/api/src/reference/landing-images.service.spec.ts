import sharp from 'sharp';
import {
  bookPicturePath,
  squareVariants,
  widthsFor,
} from './landing-images.service';

describe('landing pictures', () => {
  it('stores the standard widths a picture covers, at least one', () => {
    expect(widthsFor(2000)).toEqual([384, 640, 960]);
    expect(widthsFor(700)).toEqual([384, 640]);
    expect(widthsFor(200)).toEqual([200]);
  });

  it("finds a finished book's cover, hero sheet and pages, nothing else", () => {
    const book = {
      coverImagePath: 'books/b/cover.jpg',
      heroImagePath: 'books/b/hero.jpg',
      pages: [
        { page: 1, imagePath: 'books/b/p1.jpg' },
        { page: 2, imagePath: null },
      ],
    };
    expect(bookPicturePath(book, 'cover')).toBe('books/b/cover.jpg');
    expect(bookPicturePath(book, 'hero')).toBe('books/b/hero.jpg');
    expect(bookPicturePath(book, 'page-1')).toBe('books/b/p1.jpg');
    expect(bookPicturePath(book, 'page-2')).toBeNull();
    expect(bookPicturePath(book, 'page-9')).toBeNull();
    expect(bookPicturePath(book, 'pdf')).toBeNull();
  });

  it('makes square WebP files of an upload, and refuses what is not a picture', async () => {
    const png = await sharp({
      create: {
        width: 1000,
        height: 700,
        channels: 4,
        background: { r: 200, g: 120, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const variants = await squareVariants(png);
    expect(variants.map((v) => v.width)).toEqual([384, 640]);
    for (const variant of variants) {
      const meta = await sharp(variant.data).metadata();
      expect(meta).toMatchObject({
        format: 'webp',
        width: variant.width,
        height: variant.width,
      });
    }
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="teal"/></svg>',
    );
    // An uploaded SVG is refused; a book's own SVG picture (the mock models') is rendered.
    await expect(squareVariants(svg)).rejects.toMatchObject({
      response: { code: 'landing_bad_image' },
    });
    const drawn = await squareVariants(svg, { svg: true });
    expect(drawn.map((v) => v.width)).toEqual([384]);
  });
});
