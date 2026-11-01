import { HYPHEN_MIN_WORD, HYPHENATION, type Language } from "@fabulka/shared";

type Patterns = NonNullable<(typeof HYPHENATION)[Language]>;
type HyphenModule = typeof import("hyphen/de");

/** Each language's TeX patterns load on demand: only the book's language is downloaded. */
const LOADERS: Record<Patterns, () => Promise<HyphenModule | { default: HyphenModule }>> = {
  ru: () => import("hyphen/ru"),
  "en-us": () => import("hyphen/en-us"),
  es: () => import("hyphen/es"),
  de: () => import("hyphen/de"),
};

export type Hyphenate = ((text: string) => string) | undefined;

/**
 * The same soft hyphens the API puts into the PDF (see HYPHENATION): the book carries its own
 * hyphens, so the browser's dictionary (or its lack of one) never changes a line break. Kazakh:
 * none.
 */
export async function loadHyphenator(language: Language): Promise<Hyphenate> {
  const patterns = HYPHENATION[language];
  if (!patterns) return undefined;
  const loaded = await LOADERS[patterns]();
  const { hyphenateSync } = "default" in loaded ? loaded.default : loaded;
  return (text) => hyphenateSync(text, { minWordLength: HYPHEN_MIN_WORD });
}
