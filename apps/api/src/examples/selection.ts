import { exampleShownIn, type Language } from '@fabulka/shared';

/** Examples on the home page at most. */
export const EXAMPLE_COUNT = 12;

/** A version as the selection sees it: its language and its book. */
export interface CandidateVersion {
  language: string;
  bookId: string;
  title: string | null;
  status: string;
  heroImagePath: string | null;
}

/** An example as the selection sees it, in the home page's order. */
export interface Candidate {
  id: string;
  /** Its own countries; empty: as `templateCountries` say. */
  countries: string[];
  /** Its catalog book's countries; null for a story of its own. */
  templateCountries: string[] | null;
  versions: CandidateVersion[];
}

/** What goes on the home page for one example: its version in the page's language. */
export interface Picked {
  exampleId: string;
  version: CandidateVersion;
}

/**
 * The home page's examples for a visitor from `country` (catalogCountry: null for "other") reading
 * in `language`: each example shown in that country (exampleShownIn: its own countries, else its
 * catalog book's, else everywhere), with its finished version in exactly that language. An example
 * with no such version is left out: never another language in its place.
 */
export function pickExamples(
  examples: readonly Candidate[],
  country: string | null,
  language: Language,
  limit = EXAMPLE_COUNT,
): Picked[] {
  const picked: Picked[] = [];
  for (const example of examples) {
    if (!exampleShownIn(example.countries, example.templateCountries, country))
      continue;
    const version = example.versions.find(
      (v) => v.language === language && v.status === 'done' && v.title,
    );
    if (version) picked.push({ exampleId: example.id, version });
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * The catalog book an example comes from, for its countries: its first version's (versions in the
 * order they were added; a translation keeps its source's catalog book).
 */
export function templateCountriesOf(
  versions: readonly { template: { countries: string[] } | null }[],
): string[] | null {
  return versions[0]?.template?.countries ?? null;
}

/**
 * The examples, or, when none has a version in the page's language, the catalog samples in that
 * language for catalog books listed in the visitor's country: the block is never empty while there
 * is any sample.
 */
export function orSamples<E, S>(
  examples: readonly E[],
  samples: readonly S[],
  limit = EXAMPLE_COUNT,
): { kind: 'example'; item: E }[] | { kind: 'sample'; item: S }[] {
  if (examples.length)
    return examples.map((item) => ({ kind: 'example' as const, item }));
  return samples
    .slice(0, limit)
    .map((item) => ({ kind: 'sample' as const, item }));
}
