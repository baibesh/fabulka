import {
  BOOK_FONTS,
  BOOK_LABELS,
  BOOK_THEMES,
  LANGUAGES,
} from '@fabulka/shared';
import { ALPHABETS } from './alphabets';
import { bookFontCss, fontCodePoints, missingGlyphs } from './fonts';
import { hyphenatorFor } from './hyphenate';

describe('book fonts', () => {
  it('embeds every font file the themes use', () => {
    const css = bookFontCss();
    for (const theme of Object.values(BOOK_THEMES)) {
      for (const font of [theme.fonts.body, theme.fonts.heading]) {
        expect(css).toContain(`font-family: '${font.family}'`);
        expect(BOOK_FONTS[font.family].weights).toContain(font.weight);
      }
    }
    expect(css).not.toContain('url(./files');
  });

  it('uses only vetted wide-coverage families for body text', () => {
    for (const theme of Object.values(BOOK_THEMES)) {
      expect(BOOK_FONTS[theme.fonts.body.family].body).toBe(true);
    }
  });

  // The cmap of the actual font files, for every theme and every language it claims.
  for (const theme of Object.values(BOOK_THEMES)) {
    for (const language of theme.languages) {
      it(`${theme.id}: both fonts cover every letter of ${language}`, () => {
        const labels = BOOK_LABELS[language];
        const text =
          ALPHABETS[language] +
          labels.madeFor('Name') +
          labels.end +
          labels.talk +
          labels.drawing;
        expect(missingGlyphs(theme.fonts.body, text)).toEqual([]);
        expect(missingGlyphs(theme.fonts.heading, text)).toEqual([]);
      });
    }
  }

  it('lets every theme claim every book language', () => {
    for (const theme of Object.values(BOOK_THEMES)) {
      expect([...theme.languages].sort()).toEqual([...LANGUAGES].sort());
    }
  });

  it('finds letters a font lacks', () => {
    const lobster = { family: 'Lobster', weight: 400 };
    expect(fontCodePoints(lobster).has('қ'.codePointAt(0)!)).toBe(true);
    expect(missingGlyphs(lobster, 'Айгерим 🦄')).toEqual(['🦄']);
  });
});

describe('hyphenation', () => {
  it('hyphenates German, Russian and Spanish with soft hyphens', () => {
    expect(hyphenatorFor('de')!('Sternenreise')).toBe('Ster­nen­rei­se');
    expect(hyphenatorFor('ru')!('приключение')).toContain('­');
    expect(hyphenatorFor('es')!('aventura')).toContain('­');
  });

  it('leaves Kazakh alone: there is no dictionary, and wrong hyphens are worse than none', () => {
    expect(hyphenatorFor('kk')).toBeUndefined();
  });
});
