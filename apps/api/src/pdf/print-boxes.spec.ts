import { BOOK_FORMATS, printPageSize } from '@fabulka/shared';
import { PDFDocument } from 'pdf-lib';
import { printBoxes, withPrintBoxes } from './print-boxes';

const pt = (mm: number) => (mm * 72) / 25.4;
const corners = (box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) =>
  [box.x, box.y, box.x + box.width, box.y + box.height].map(
    (n) => Math.round(n * 100) / 100,
  );

describe('print boxes', () => {
  it('puts the trim 13 mm and the bleed 10 mm in from the sheet edges (3 mm bleed, 10 mm slug)', () => {
    const format = BOOK_FORMATS['a5-portrait'];
    const sheet = printPageSize(format);
    const { trim, bleed } = printBoxes(format, pt(sheet.heightMm));
    expect(corners(trim)).toEqual(
      corners({ x: pt(13), y: pt(13), width: pt(148), height: pt(210) }),
    );
    expect(corners(bleed)).toEqual(
      corners({ x: pt(10), y: pt(10), width: pt(154), height: pt(216) }),
    );
  });

  it('measures from the top when Chromium rounded the sheet a little taller', () => {
    const format = BOOK_FORMATS['square-210'];
    const exact = pt(printPageSize(format).heightMm);
    const rounded = printBoxes(format, exact + 0.5);
    expect(rounded.trim.y).toBeCloseTo(
      printBoxes(format, exact).trim.y + 0.5,
      6,
    );
    expect(rounded.trim.height).toBeCloseTo(pt(210), 6);
  });

  it('writes TrimBox and BleedBox on every page of the PDF, inside the MediaBox', async () => {
    const format = BOOK_FORMATS['a4-landscape'];
    const sheet = printPageSize(format);
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++)
      doc.addPage([pt(sheet.widthMm), pt(sheet.heightMm)]);
    const out = await withPrintBoxes(await doc.save(), format);

    const text = out.toString('latin1');
    expect(text.match(/\/TrimBox \[/g)).toHaveLength(3);
    expect(text.match(/\/BleedBox \[/g)).toHaveLength(3);

    const back = await PDFDocument.load(out);
    for (const page of back.getPages()) {
      const media = page.getMediaBox();
      const trim = page.getTrimBox();
      const bleed = page.getBleedBox();
      expect(trim.width).toBeCloseTo(pt(297), 2);
      expect(trim.height).toBeCloseTo(pt(210), 2);
      expect(bleed.width).toBeCloseTo(pt(303), 2);
      expect(bleed.height).toBeCloseTo(pt(216), 2);
      // The bleed is 3 mm around the trim, the media box around both.
      expect(trim.x - bleed.x).toBeCloseTo(pt(3), 2);
      expect(trim.y - bleed.y).toBeCloseTo(pt(3), 2);
      expect(bleed.x).toBeGreaterThan(media.x);
      expect(bleed.y + bleed.height).toBeLessThan(media.y + media.height);
    }
  });
});
