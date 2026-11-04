import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import sharp from 'sharp';

/** Pictures go into a PDF at this resolution: more pixels an inch are never seen on paper. */
export const PRINT_DPI = 300;
/**
 * JPEG quality of a picture made for the PDF (mozjpeg, 4:2:0), checked side by side at 300 dpi on
 * the comics' line art and a picture book page: printed at SHARP dpi or finer, its artefacts are a
 * fraction of a printed dot (`fine`); a picture printed coarser, each pixel bigger than a dot (a
 * picture book page across 210 mm), keeps more (`coarse`). Nothing shows either way.
 */
export const PRINT_JPEG_QUALITY = { fine: 80, coarse: 88 } as const;
/** From this many pixels an inch on paper a picture counts as finely printed. */
const SHARP = 240;
/** A file this heavy (bytes a pixel) is worth re-encoding even at full size: Muse's pictures come near-lossless. */
const HEAVY = 0.25;
const RASTER = new Set(['.jpeg', '.jpg', '.png', '.webp']);

/** How a picture is shown: its box (CSS px), its own size, how it fits the box and where it sits (0..1). */
export interface Shown {
  box: { w: number; h: number };
  natural: { w: number; h: number };
  fit: string;
  position: { x: number; y: number };
}

/** The part of a picture in view (its own pixels), the size it is printed at (pixels) and how fine that is (pixels an inch). */
export interface PrintCut {
  crop: { left: number; top: number; width: number; height: number };
  width: number;
  height: number;
  dpi: number;
}

/**
 * What of a picture a page prints, and at what size: a picture that covers its box (object-fit:
 * cover) is cut to the part in view; any picture is scaled to the box's printed size at `dpi`, never
 * up. CSS pixels are 96 an inch.
 */
export function printCut(shown: Shown, dpi = PRINT_DPI): PrintCut {
  const { box, natural } = shown;
  const k = dpi / 96;
  if (shown.fit === 'cover') {
    const r = Math.max(box.w / natural.w, box.h / natural.h);
    const width = Math.min(natural.w, Math.max(1, Math.round(box.w / r)));
    const height = Math.min(natural.h, Math.max(1, Math.round(box.h / r)));
    const left = Math.round((natural.w - width) * clamp01(shown.position.x));
    const top = Math.round((natural.h - height) * clamp01(shown.position.y));
    const scale = Math.min(1, (box.w * k) / width);
    const out = Math.max(1, Math.round(width * scale));
    return {
      crop: { left, top, width, height },
      width: out,
      height: Math.max(1, Math.round(height * scale)),
      dpi: Math.round((out / box.w) * 96),
    };
  }
  // Contained (or stretched): the whole picture, as big as it is drawn.
  const r =
    shown.fit === 'contain' || shown.fit === 'scale-down'
      ? Math.min(box.w / natural.w, box.h / natural.h)
      : Math.max(box.w / natural.w, box.h / natural.h);
  const scale = Math.min(1, r * k);
  const out = Math.max(1, Math.round(natural.w * scale));
  return {
    crop: { left: 0, top: 0, width: natural.w, height: natural.h },
    width: out,
    height: Math.max(1, Math.round(natural.h * scale)),
    dpi: Math.round((out / (natural.w * r)) * 96),
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Swaps every picture of the open page for a copy made for print before the PDF is printed: cut
 * to the part in view and scaled to its printed size at PRINT_DPI, as a JPEG at PRINT_JPEG_QUALITY
 * (a picture with transparency stays a PNG). The copies go to `outDir`; the page's HTML and the
 * site's pictures are not touched. Returns how many pictures were swapped.
 */
export async function printPictures(
  page: Page,
  outDir: string,
  dpi = PRINT_DPI,
): Promise<number> {
  const shown = await page.evaluate(() =>
    Array.from(document.images).map((img, index) => {
      const style = getComputedStyle(img);
      const [px, py] = style.objectPosition
        .split(' ')
        .map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      img.dataset.printIndex = String(index);
      return {
        index,
        src: img.currentSrc || img.src,
        box: { w: img.offsetWidth, h: img.offsetHeight },
        natural: { w: img.naturalWidth, h: img.naturalHeight },
        fit: style.objectFit,
        position: { x: px ?? 0.5, y: py ?? px ?? 0.5 },
      };
    }),
  );
  await mkdir(outDir, { recursive: true });
  const made = new Map<string, Promise<string | null>>();
  const swaps: { index: number; url: string }[] = [];
  for (const picture of shown) {
    if (
      !picture.src.startsWith('file:') ||
      !picture.natural.w ||
      !picture.box.w
    )
      continue;
    const file = fileURLToPath(picture.src);
    if (!RASTER.has(extname(file).toLowerCase())) continue;
    const cut = printCut(picture, dpi);
    const key = `${file}|${JSON.stringify(cut)}`;
    if (!made.has(key))
      made.set(key, makeCopy(file, cut, picture.natural, outDir));
    const url = await made.get(key)!;
    if (url) swaps.push({ index: picture.index, url });
  }
  await page.evaluate(async (swaps) => {
    await Promise.all(
      swaps.map(async ({ index, url }) => {
        const img = document.querySelector<HTMLImageElement>(
          `img[data-print-index="${index}"]`,
        );
        if (!img) return;
        img.src = url;
        // The copy is cut to what was in view: it fills the box exactly.
        if (getComputedStyle(img).objectFit === 'cover')
          img.style.objectPosition = '50% 50%';
        await img.decode().catch(() => undefined);
      }),
    );
  }, swaps);
  return swaps.length;
}

/**
 * A print copy of one picture, or null when it would not be lighter (a small picture already at its
 * printed size). Named by the source's path, size, time and the cut, so a redrawn picture gets a new one.
 */
async function makeCopy(
  file: string,
  cut: PrintCut,
  natural: { w: number; h: number },
  outDir: string,
): Promise<string | null> {
  const info = await stat(file);
  const whole =
    cut.crop.width === natural.w &&
    cut.crop.height === natural.h &&
    cut.width === natural.w;
  if (whole && info.size / (natural.w * natural.h) < HEAVY) return null;
  const meta = await sharp(file).metadata();
  // Sharp reads the file's own size; the browser's natural size is the same for these pictures.
  if (meta.width !== natural.w || meta.height !== natural.h) return null;
  const pipeline = sharp(file)
    .extract(cut.crop)
    .resize(cut.width, cut.height, { fit: 'fill' });
  const alpha = meta.hasAlpha;
  const data = alpha
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline
        .flatten({ background: '#ffffff' })
        .jpeg({
          quality:
            cut.dpi >= SHARP
              ? PRINT_JPEG_QUALITY.fine
              : PRINT_JPEG_QUALITY.coarse,
          mozjpeg: true,
          chromaSubsampling: '4:2:0',
        })
        .toBuffer();
  if (data.length >= info.size) return null;
  const name = createHash('sha1')
    .update(`${file}|${info.size}|${info.mtimeMs}|${JSON.stringify(cut)}`)
    .digest('hex')
    .slice(0, 16);
  const path = join(outDir, `${name}.${alpha ? 'png' : 'jpeg'}`);
  await writeFile(path, data);
  return pathToFileURL(path).href;
}
