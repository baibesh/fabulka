import { HYPHEN_MIN_WORD, HYPHENATION, type Language } from '@fabulka/shared';
import * as de from 'hyphen/de';
import * as enUs from 'hyphen/en-us';
import * as es from 'hyphen/es';
import * as ru from 'hyphen/ru';

/** TeX patterns by name (hyph-utf8, through the `hyphen` package). */
const PATTERNS: Record<
  NonNullable<(typeof HYPHENATION)[Language]>,
  typeof de
> = { ru, 'en-us': enUs, es, de };

/**
 * Soft hyphens for a book language, the same ones the site inserts: Chromium hyphenates only with
 * the OS dictionaries (macOS yes, a Linux server no) and never Kazakh, so the book carries its own
 * hyphens and both renderers just honour them. Undefined for Kazakh: no hyphenation at all.
 */
export function hyphenatorFor(
  language: Language,
): ((text: string) => string) | undefined {
  const patterns = HYPHENATION[language];
  if (!patterns) return undefined;
  const { hyphenateSync } = PATTERNS[patterns];
  return (text) => hyphenateSync(text, { minWordLength: HYPHEN_MIN_WORD });
}
