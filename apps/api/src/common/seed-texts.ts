import { LANGUAGES, type Language } from '@fabulka/shared';
import { ADDED_LANGUAGES } from './added-languages';
import { sameJson } from './same-json';

/** A seed row's texts by language (a method's name and summary, a catalog book's translation). */
export type SeedTexts = Partial<Record<Language, unknown>>;

/**
 * The languages in which a stored seed row should take today's seed text on start: a language
 * added after it was seeded (ADDED_LANGUAGES) where it has no text (`missing`), and a text still
 * equal to an older seed of it (`older`, frozen copies), so never edited. A text the admin wrote
 * is never replaced.
 */
export function seedTextUpdates(
  stored: SeedTexts,
  seed: SeedTexts,
  older: readonly (SeedTexts | undefined)[],
  missing: (text: unknown) => boolean,
): Language[] {
  return LANGUAGES.filter((lang) => {
    if (seed[lang] === undefined || sameJson(seed[lang], stored[lang])) {
      return false;
    }
    if (ADDED_LANGUAGES.includes(lang) && missing(stored[lang])) return true;
    return older.some(
      (copy) =>
        copy?.[lang] !== undefined && sameJson(copy[lang], stored[lang]),
    );
  });
}
