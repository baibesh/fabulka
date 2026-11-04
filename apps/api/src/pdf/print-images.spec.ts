import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { PRINT_DPI, printCut, printPictures } from './print-images';

/** CSS pixels of a length in millimetres. */
const px = (mm: number) => (mm / 25.4) * 96;

describe('pictures cut and scaled for print', () => {
  it('cuts a picture that covers its box to the part in view, at 300 dpi', () => {
    // A 3:2 picture in a strip panel (91 x 54 mm): the sides of the crop's height are cut, the rest scaled down.
    const cut = printCut({
      box: { w: px(91), h: px(54) },
      natural: { w: 1920, h: 1280 },
      fit: 'cover',
      position: { x: 0.5, y: 0.25 },
    });
    expect(cut.crop.width).toBe(1920);
    expect(cut.crop.height).toBeCloseTo(1139, -1);
    expect(cut.crop.top).toBeCloseTo((1280 - cut.crop.height) * 0.25, 0);
    expect(cut.width).toBe(Math.round((91 / 25.4) * PRINT_DPI));
    expect(cut.height / cut.width).toBeCloseTo(54 / 91, 2);
    expect(cut.dpi).toBeCloseTo(PRINT_DPI, -1);
  });

  it('never scales a picture up, and keeps a contained one whole', () => {
    const wide = printCut({
      box: { w: px(186), h: px(74) },
      natural: { w: 1920, h: 1280 },
      fit: 'cover',
      position: { x: 0.5, y: 0.5 },
    });
    // 186 mm need 2197 px at 300 dpi: the picture's own 1920 are kept, only the part in view.
    expect(wide.width).toBe(1920);
    expect(wide.height).toBeCloseTo(764, -1);
    expect(wide.dpi).toBeLessThan(PRINT_DPI);
    const contained = printCut({
      box: { w: px(70), h: px(70) },
      natural: { w: 1600, h: 1600 },
      fit: 'contain',
      position: { x: 0.5, y: 0.5 },
    });
    expect(contained.crop).toEqual({
      left: 0,
      top: 0,
      width: 1600,
      height: 1600,
    });
    expect(contained.width).toBe(Math.round((70 / 25.4) * PRINT_DPI));
  });

  it('swaps the pictures of an open page for lighter copies of their printed size', async () => {
    jest.setTimeout(60_000);
    const dir = await mkdtemp(join(tmpdir(), 'fabulka-print-'));
    const browser = await chromium.launch();
    try {
      // A detailed, nearly lossless picture, like Muse Image's.
      const noise = Buffer.alloc(1920 * 1280 * 3);
      for (let i = 0; i < noise.length; i++)
        noise[i] = (i * 7919 + (i >> 9) * 31) % 251;
      const file = join(dir, 'page-1-2.jpeg');
      await sharp(noise, { raw: { width: 1920, height: 1280, channels: 3 } })
        .jpeg({ quality: 97 })
        .toFile(file);
      const page = await browser.newPage();
      await writeFile(
        join(dir, 'page.html'),
        `<img src="page-1-2.jpeg" style="display:block;width:91mm;height:54mm;object-fit:cover;object-position:50% 30%">`,
      );
      await page.goto(pathToFileURL(join(dir, 'page.html')).href, {
        waitUntil: 'load',
      });
      const swapped = await printPictures(page, join(dir, 'print'));
      expect(swapped).toBe(1);
      const [copy] = await readdir(join(dir, 'print'));
      const meta = await sharp(join(dir, 'print', copy)).metadata();
      expect(meta.width).toBe(Math.round((91 / 25.4) * PRINT_DPI));
      expect((await stat(join(dir, 'print', copy))).size).toBeLessThan(
        (await stat(file)).size / 3,
      );
      // The page now shows the copy, filling the same box; the original file is untouched.
      const shown = await page.evaluate(() => {
        const img = document.images[0];
        return {
          src: img.currentSrc,
          w: img.naturalWidth,
          position: img.style.objectPosition,
        };
      });
      expect(shown.src).toContain('/print/');
      expect(shown.w).toBe(meta.width);
      expect(shown.position).toBe('50% 50%');
      expect((await sharp(file).metadata()).width).toBe(1920);
    } finally {
      await browser.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
