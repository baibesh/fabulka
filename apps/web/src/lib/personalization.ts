import type { Language } from "@fabulka/shared";

/** Something the parent gave (a name, a city, an answer) and what to say where it shows up in a book. */
export interface Highlight {
  value: string;
  hint: string;
}

/** A run of book text: plain, or a word (or words) that came from a highlight. */
export type Piece = string | { text: string; hint: string };

const MIN_STEM = 3;

/** How each book language inflects the words a parent gives, so their forms in the text are found. */
interface Inflection {
  /** Endings dropped before matching, longest first; `lowercaseOnly` keeps them on capitalised words. */
  endings: readonly string[];
  lowercaseOnly?: boolean;
  /** A last letter that changes or goes when an ending follows: Алия → Алии, Моншақ → Моншағы. */
  final?: RegExp;
  /** How many letters an inflected form may add to its stem. */
  maxSuffix: number;
  /** Words too common to point at in an answer such as «когда брат берёт игрушки». */
  stopWords: readonly string[];
  /**
   * German capitalises every noun, so a capitalised word inside a phrase is a name only at its end
   * («roter Kater Barsik»).
   */
  nounsCapitalised?: boolean;
}

const INFLECTIONS: Record<Language, Inflection> = {
  // Алия → Алией, Барсик → Барсиками, зелёный → зелёного.
  ru: {
    endings: ["ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые", "ие", "ья", "ье", "ьи"],
    final: /[аеиоуыэюяйь]$/,
    maxSuffix: 3,
    stopWords: ["когда", "если", "чтобы", "потом", "очень", "тоже", "только", "вместе"],
  },
  // Suffixes stack on an unchanged stem (Алия → Алияның, Барсик → Барсиктермен), but a final
  // қ/к/п softens before a vowel (Моншақ → Моншағы, бауырсақ → бауырсағы).
  kk: {
    endings: [],
    final: /[қкп]$/,
    maxSuffix: 6,
    stopWords: ["кезде", "үшін", "және", "бірге", "сосын", "егер", "барлық"],
  },
  // Aliya's (the apostrophe splits the word), friends, drawing.
  en: {
    endings: [],
    maxSuffix: 3,
    stopWords: ["when", "that", "then", "with", "they", "them", "their", "from", "into", "have", "very", "also", "through"],
  },
  // amarillo → amarilla, amarillos; amigo → amigas.
  es: {
    endings: [],
    final: /[aeo]$/,
    maxSuffix: 3,
    stopWords: ["cuando", "para", "como", "porque", "pero", "también", "juntos", "juntas", "muy", "hacer"],
  },
  // gelbe → gelben, Alija → Alijas; nouns keep their ending.
  de: {
    endings: ["en", "er", "es", "em", "e"],
    lowercaseOnly: true,
    maxSuffix: 3,
    stopWords: ["wenn", "dass", "dann", "auch", "sehr", "zusammen", "immer", "eine", "einen", "einem", "einer"],
    nounsCapitalised: true,
  },
};

const WORD = /[\p{L}\p{M}]+/gu;
const CAPITAL = /^\p{Lu}/u;

const normalize = (word: string, language: Language) => word.normalize("NFC").toLocaleLowerCase(language).replaceAll("ё", "е");

/**
 * The part of a word that stays when the language inflects it: Бусинка → бусинк, зелёный → зелен,
 * Моншақ → монша, amarillo → amarill.
 */
export function stem(word: string, language: Language = "ru"): string {
  const { endings, lowercaseOnly, final } = INFLECTIONS[language];
  const w = normalize(word, language);
  if (!lowercaseOnly || !CAPITAL.test(word)) {
    for (const ending of endings) {
      if (w.endsWith(ending) && w.length - ending.length >= MIN_STEM) return w.slice(0, -ending.length);
    }
  }
  if (final?.test(w) && w.length - 1 >= MIN_STEM) return w.slice(0, -1);
  return w;
}

/**
 * The words of a value worth finding in the text: a name inside a phrase when there is one
 * («рыжий кот Барсик» → Барсик), otherwise its longer words («глубоко подышать» → both).
 */
export function keyWords(value: string, language: Language = "ru"): string[] {
  const { stopWords, nounsCapitalised } = INFLECTIONS[language];
  const words = value.match(WORD) ?? [];
  const capitalised = words.filter((word, i) => i > 0 && CAPITAL.test(word));
  const last = words.at(-1);
  const names = nounsCapitalised && words.length > 1 && last && CAPITAL.test(last) ? [last] : capitalised;
  if (names.length) return names;
  const long = words.filter((word) => word.length >= 4 && !stopWords.includes(normalize(word, language)));
  return long.length ? long : words.filter((word) => word.length >= MIN_STEM);
}

/**
 * Splits text into plain runs and the words that came from the highlights, matching inflected
 * forms by stem in the book's language (Алия finds Алии, Алияның; Alija finds Alijas). Earlier
 * highlights win; neighbouring words from the same highlight («Гульнара апай») join into one piece.
 */
export function markPersonal(text: string, highlights: Highlight[], language: Language = "ru"): Piece[] {
  const { maxSuffix } = INFLECTIONS[language];
  const stems = highlights.map((h) => ({ hint: h.hint, stems: [...new Set(keyWords(h.value, language).map((w) => stem(w, language)))] }));
  const hintFor = (word: string) => {
    const w = normalize(word, language);
    return stems.find((h) => h.stems.some((s) => w.startsWith(s) && w.length - s.length <= maxSuffix))?.hint;
  };

  const pieces: Piece[] = [];
  let at = 0;
  for (const match of text.matchAll(WORD)) {
    const hint = hintFor(match[0]);
    if (!hint) continue;
    const gap = text.slice(at, match.index);
    const last = pieces.at(-1);
    if (typeof last === "object" && last.hint === hint && gap.trim() === "") last.text += gap + match[0];
    else {
      if (gap) pieces.push(gap);
      pieces.push({ text: match[0], hint });
    }
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push(text.slice(at));
  return pieces;
}
