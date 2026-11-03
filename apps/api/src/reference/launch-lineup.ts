import {
  CountriesSchema,
  DEFAULT_COUNTRIES,
  type CountryEntry,
} from '@fabulka/shared';
import {
  SEEDED_COUNTRIES_V1,
  SEEDED_COUNTRIES_V2,
  SEEDED_COUNTRIES_V3,
} from './seeded';

/**
 * The launch country lineup (agreed with the owner in November 2026): Kazakhstan, the US, Canada,
 * Malaysia, Australia, Germany, Austria, Switzerland and Spain, each in its own currency (today's
 * DEFAULT_COUNTRIES); everyone else is "other". It replaces the old seeded lists once, on the API's
 * start, and never again: the outcome is stored under LINEUP_KEY, and while that row is there the
 * countries are the owner's alone.
 *
 * - The stored list still has exactly the codes of an older seed (the 26 countries the site had, or
 *   an earlier 19): it was never reshaped, so it becomes the lineup. Kazakhstan keeps its stored
 *   entry as it is (languages, print, payment); Germany keeps print if the owner switched it on; a
 *   payment provider set on a kept country stays. Settings of the countries that leave (their own
 *   prices, delivery, formats, cities, landing) stay stored and are simply not used.
 * - The stored list is already the lineup (a fresh database, seeded with it): nothing to do.
 * - Anything else (the owner added or removed countries): left alone, and the log says so.
 */
export const LINEUP_KEY = 'reference.countries_lineup';
export const LINEUP_VERSION = '2026-11-launch';

/** The older seeds whose code sets mean "never reshaped by the owner". */
const OLD_SEEDS = [
  SEEDED_COUNTRIES_V1,
  SEEDED_COUNTRIES_V2,
  SEEDED_COUNTRIES_V3,
];

export type LineupOutcome =
  | {
      action: 'applied';
      /** Codes that left the list (their stored per-country settings stay, unused). */
      removed: string[];
      /** Codes that joined it. */
      added: string[];
      /** Kept codes whose stored entry differed from the seed (the owner's edits), as kept or merged. */
      edited: string[];
    }
  | { action: 'already' }
  | { action: 'skipped'; reason: 'edited' | 'invalid'; codes: string[] };

/** What the flag row holds. */
export interface LineupFlag {
  version: string;
  at: string;
  outcome: LineupOutcome;
}

const codesOf = (list: readonly { code: string }[]) =>
  [...list.map((c) => c.code)].sort().join(',');

function seedEntry(seed: unknown, code: string): unknown {
  return (seed as { code: string }[]).find((c) => c.code === code);
}

/**
 * The list the stored one becomes, and what happened (see above). `countries` is null when the
 * stored list stays as it is.
 */
export function launchLineup(stored: unknown): {
  countries: CountryEntry[] | null;
  outcome: LineupOutcome;
} {
  const parsed = CountriesSchema.safeParse(stored);
  if (!parsed.success) {
    return {
      countries: null,
      outcome: { action: 'skipped', reason: 'invalid', codes: [] },
    };
  }
  const list = parsed.data;
  if (codesOf(list) === codesOf(DEFAULT_COUNTRIES)) {
    return { countries: null, outcome: { action: 'already' } };
  }
  const seed = OLD_SEEDS.find(
    (old) => codesOf(old as { code: string }[]) === codesOf(list),
  );
  if (!seed) {
    return {
      countries: null,
      outcome: {
        action: 'skipped',
        reason: 'edited',
        codes: list.map((c) => c.code),
      },
    };
  }
  const byCode = new Map(list.map((c) => [c.code, c]));
  const edited = list
    .filter(
      (c) =>
        JSON.stringify(normalized(c)) !==
        JSON.stringify(normalized(seedEntry(seed, c.code) as CountryEntry)),
    )
    .map((c) => c.code);
  const countries = DEFAULT_COUNTRIES.map((entry): CountryEntry => {
    const old = byCode.get(entry.code);
    if (!old) return entry;
    if (entry.code === 'KZ') return old;
    return {
      ...entry,
      // Print stays off unless the owner already opened it (Germany).
      print: entry.code === 'DE' ? old.print : entry.print,
      ...(old.payment && { payment: old.payment }),
    };
  });
  const lineup = new Set(DEFAULT_COUNTRIES.map((c) => c.code));
  return {
    countries,
    outcome: {
      action: 'applied',
      removed: list.map((c) => c.code).filter((code) => !lineup.has(code)),
      added: DEFAULT_COUNTRIES.map((c) => c.code).filter(
        (code) => !byCode.has(code),
      ),
      edited: edited.filter((code) => lineup.has(code)),
    },
  };
}

/** An entry with its keys in one order and no empty payment, for comparing with a seed. */
function normalized(entry: CountryEntry | undefined) {
  if (!entry) return null;
  return {
    code: entry.code,
    languages: entry.languages,
    currency: entry.currency,
    print: entry.print,
    payment: entry.payment ?? 'manual',
  };
}

/** One line for the log. */
export function describeLineup(outcome: LineupOutcome): string {
  switch (outcome.action) {
    case 'applied':
      return (
        `launch country lineup applied: ${DEFAULT_COUNTRIES.map((c) => c.code).join(', ')}` +
        `; removed ${outcome.removed.join(', ') || 'none'} (their per-country settings stay stored, unused)` +
        `; added ${outcome.added.join(', ') || 'none'}` +
        (outcome.edited.length
          ? `; kept the owner's edits of ${outcome.edited.join(', ')} where the lineup allows`
          : '')
      );
    case 'already':
      return 'launch country lineup: the stored list is the lineup already';
    case 'skipped':
      return outcome.reason === 'edited'
        ? `launch country lineup NOT applied: the owner changed the countries since the seed (${outcome.codes.join(', ')}); edit them in the admin's Countries tab`
        : 'launch country lineup NOT applied: the stored list is not valid';
  }
}
