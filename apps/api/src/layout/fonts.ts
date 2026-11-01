import { BOOK_FONTS, type FontRef } from '@fabulka/shared';
import * as fontkit from 'fontkit';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

function packageRoot(family: string): string {
  const font = BOOK_FONTS[family];
  if (!font) throw new Error(`font ${family} is not one of BOOK_FONTS`);
  return dirname(require.resolve(`${font.package}/package.json`));
}

/**
 * @font-face rules for every book font and weight, every subset, with file:// URLs: the PDF embeds
 * the same files the site loads from the same @fontsource packages.
 */
export function bookFontCss(): string {
  return Object.entries(BOOK_FONTS)
    .flatMap(([family, font]) => {
      const root = packageRoot(family);
      const files = pathToFileURL(join(root, 'files')).href;
      return font.weights.map((weight) =>
        readFileSync(join(root, `${weight}.css`), 'utf8').replaceAll(
          'url(./files',
          `url(${files}`,
        ),
      );
    })
    .join('\n');
}

const coverage = new Map<string, Set<number>>();

/** Every code point a font has, across all its subset files (read from their cmap tables). */
export function fontCodePoints({ family, weight }: FontRef): Set<number> {
  const key = `${family}:${weight}`;
  const cached = coverage.get(key);
  if (cached) return cached;
  const dir = join(packageRoot(family), 'files');
  const points = new Set<number>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(`-${weight}-normal.woff2`)) continue;
    const font = fontkit.create(readFileSync(join(dir, file)));
    if ('characterSet' in font)
      for (const c of font.characterSet) points.add(c);
  }
  if (!points.size) throw new Error(`no files for ${family} ${weight}`);
  coverage.set(key, points);
  return points;
}

/** Letters of `text` the font lacks (spaces and controls aside). */
export function missingGlyphs(font: FontRef, text: string): string[] {
  const points = fontCodePoints(font);
  const missing = new Set<string>();
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (/\s/u.test(char) || code < 0x20 || code === 0xad) continue;
    if (!points.has(code)) missing.add(char);
  }
  return [...missing];
}
