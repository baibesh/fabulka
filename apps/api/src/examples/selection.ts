import {
  exampleShownIn,
  type CountryRule,
  type Language,
} from '@fabulka/shared';

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
  /** Its own rule; no countries: as `template` says. */
  rule: CountryRule;
  /** Its catalog book's rule; null for a story of its own. */
  template: CountryRule | null;
  versions: CandidateVersion[];
}

/** What goes on the home page for one example: its version in the page's language. */
export interface Picked {
  exampleId: string;
  version: CandidateVersion;
}

/**
 * The home page's examples for a visitor from `country` (catalogCountry: null for "other") reading
 * in `language`: each example shown in that country (exampleShownIn: its own rule, else its
 * catalog book's, else everywhere; a rule lists where it shows or, "everywhere except…", where it
 * does not), with its finished version in exactly that language. An example
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
    if (!exampleShownIn(example.rule, example.template, country)) continue;
    const version = example.versions.find(
      (v) => v.language === language && v.status === 'done' && v.title,
    );
    if (version) picked.push({ exampleId: example.id, version });
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * The catalog book an example comes from, for its countries: its first version's rule (versions in
 * the order they were added; a translation keeps its source's catalog book).
 */
export function templateRuleOf(
  versions: readonly {
    template: {
      countries: string[];
      countriesMode: CountryRule['mode'];
    } | null;
  }[],
): CountryRule | null {
  const template = versions[0]?.template;
  return template
    ? { mode: template.countriesMode, countries: template.countries }
    : null;
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
