import {
  PRINT_SLUG_MM,
  type BookFormat,
  type CoverWrap,
} from '@fabulka/shared';
import { PDFDocument } from 'pdf-lib';

const pt = (mm: number) => (mm * 72) / 25.4;

/** A PDF box in points from the page's bottom left: x, y, width, height. */
export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the trimmed page and its bleed sit on a print sheet (printDocument: the page with its bleed
 * at the slug's distance from the sheet's top left). Measured from the top, since Chromium rounds the
 * sheet to whole CSS pixels at the bottom and right.
 */
export function printBoxes(
  format: BookFormat,
  sheetHeightPt: number,
): { trim: PdfBox; bleed: PdfBox } {
  const s = PRINT_SLUG_MM;
  const b = format.bleedMm;
  const box = (leftMm: number, topMm: number, wMm: number, hMm: number) => ({
    x: pt(leftMm),
    y: sheetHeightPt - pt(topMm + hMm),
    width: pt(wMm),
    height: pt(hMm),
  });
  return {
    trim: box(s + b, s + b, format.widthMm, format.heightMm),
    bleed: box(s, s, format.widthMm + 2 * b, format.heightMm + 2 * b),
  };
}

/** The same for the cover wrap's sheet: the finished wrap, and its bleed or a hardcover's turn-in. */
export function wrapBoxes(
  wrap: CoverWrap,
  sheetHeightPt: number,
): { trim: PdfBox; bleed: PdfBox } {
  return printBoxes(
    {
      id: 'wrap',
      widthMm: wrap.widthMm,
      heightMm: wrap.heightMm,
      bleedMm: wrap.marginMm,
      safeMm: 0,
    },
    sheetHeightPt,
  );
}

/**
 * The print file with TrimBox and BleedBox on every page, so a print shop's preflight sees where the
 * page is cut and how far the pictures run on (Chromium writes only the MediaBox). With `wrap`, the
 * first page is the cover wrap. Saved without object streams, so the page dictionaries stay
 * readable to the simplest preflight tools.
 */
export async function withPrintBoxes(
  pdf: Uint8Array,
  format: BookFormat,
  wrap?: CoverWrap,
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  for (const [i, page] of doc.getPages().entries()) {
    const height = page.getMediaBox().height;
    const { trim, bleed } =
      wrap && i === 0 ? wrapBoxes(wrap, height) : printBoxes(format, height);
    page.setBleedBox(bleed.x, bleed.y, bleed.width, bleed.height);
    page.setTrimBox(trim.x, trim.y, trim.width, trim.height);
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
