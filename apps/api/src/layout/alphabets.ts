import { BOOK_LABELS, type Language } from '@fabulka/shared';

const upper = (from: string, to: string) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
    String.fromCharCode(from.charCodeAt(0) + i),
  ).join('');
const LATIN = upper('A', 'Z') + upper('a', 'z');
const CYRILLIC = upper('А', 'я') + 'Ёё';
const DIGITS = '0123456789';
const COMMON = '.,:;!?-–—…()\'"%·';

/** Every letter and the punctuation a book in each language may print. */
export const ALPHABETS: Record<Language, string> = {
  ru: CYRILLIC + '«»„“' + COMMON + DIGITS,
  kk: CYRILLIC + 'ӘәҒғҚқҢңӨөҰұҮүҺһІі' + '«»' + COMMON + DIGITS,
  en: LATIN + '“”‘’' + COMMON + DIGITS,
  es: LATIN + 'ÁÉÍÓÚÜÑáéíóúüñ¿¡«»' + COMMON + DIGITS,
  de: LATIN + 'ÄÖÜäöüß„“‚‘»«' + COMMON + DIGITS,
};

/** Every letter a book in `language` may print, with its fixed words (the cover, the end…). */
export function languageText(language: Language): string {
  const labels = BOOK_LABELS[language];
  return (
    ALPHABETS[language] +
    labels.madeFor('Name') +
    labels.end +
    labels.talk +
    labels.drawing
  );
}
