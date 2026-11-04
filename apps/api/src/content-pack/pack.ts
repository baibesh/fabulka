import {
  normalizePages,
  pageImagePaths,
  CountriesModeSchema,
  CountryLandingSchema,
  LANDING_IMAGE_SLOTS,
  LandingHeroSchema,
  LandingImageSetSchema,
  LandingOverridesSchema,
  LanguageSchema,
  ruleShows,
  showcaseRule,
  withCountry,
  type CountryRule,
  type LandingImage,
  type LandingOverrides,
} from '@fabulka/shared';
import { z } from 'zod';
import { TRANSLATION_CLIENT_KEY } from '../examples/translation';

/**
 * A content pack: finished books made somewhere else (a local stack with the real models) and what
 * they are on the site - catalog samples per country, the home page's examples, a country's landing
 * texts and pictures - with their files, to be put into another database and storage by stable keys:
 * catalog books by slug, books and examples by their own (globally unique) ids, countries by code.
 * Importing the same pack again changes nothing. This file is the format and the planning; the
 * reading and writing are in export.ts and import.ts.
 */
export const PACK_VERSION = 1;
export const MANIFEST = 'manifest.json';
/** Where the pack keeps the files, by their storage paths. */
export const FILES_DIR = 'files';
/** Books a pack brings are staff's: they never show in a visitor's "My books". */
export const CONTENT_CLIENT_KEY = 'staff:content-pack';

const CodeSchema = z.string().regex(/^[A-Z]{2}$/);
const IdSchema = z.string().regex(/^[a-z0-9]{10,40}$/);
const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);

/** A stored file a pack may carry: a book's (books/<id>/…) or a landing picture (landing/XX/…). */
export function safeStoragePath(path: string): boolean {
  const segments = path.split('/');
  if (segments.some((s) => !/^[A-Za-z0-9._-]+$/.test(s) || /^\.+$/.test(s)))
    return false;
  const [root, owner] = segments;
  if (segments.length < 3) return false;
  if (root === 'books') return IdSchema.safeParse(owner).success;
  if (root === 'landing') return CodeSchema.safeParse(owner).success;
  return false;
}

export const PackFileSchema = z.object({
  path: z.string().refine(safeStoragePath, 'Not a book or landing file'),
  bytes: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PackFile = z.infer<typeof PackFileSchema>;

export const PackBookSchema = z.object({
  id: IdSchema,
  /** Its catalog book's slug; null for a story of its own. */
  template: SlugSchema.nullable(),
  /** The Book row's columns but id, templateId and userId (dates as ISO strings). */
  row: z.record(z.string(), z.unknown()),
});
export type PackBook = z.infer<typeof PackBookSchema>;

export const PackSampleSchema = z.object({
  template: SlugSchema,
  language: LanguageSchema,
  country: CodeSchema,
  book: IdSchema,
});
export type PackSample = z.infer<typeof PackSampleSchema>;

export const PackExampleSchema = z.object({
  id: IdSchema,
  countries: z.array(CodeSchema).min(1),
  mode: CountriesModeSchema,
  versions: z
    .array(z.object({ language: LanguageSchema, book: IdSchema }))
    .min(1),
});
export type PackExample = z.infer<typeof PackExampleSchema>;

export const PackLandingSchema = z.object({
  country: CodeSchema,
  hero: z.partialRecord(LanguageSchema, LandingHeroSchema).default({}),
  images: z
    .partialRecord(z.enum(LANDING_IMAGE_SLOTS), LandingImageSetSchema)
    .default({}),
});
export type PackLanding = z.infer<typeof PackLandingSchema>;

export const PackSchema = z.object({
  version: z.literal(PACK_VERSION),
  createdAt: z.string(),
  books: z.array(PackBookSchema),
  samples: z.array(PackSampleSchema).default([]),
  /** In the home page's order: the first goes first. */
  examples: z.array(PackExampleSchema).default([]),
  landing: z.array(PackLandingSchema).default([]),
  /**
   * Countries where the examples already on the site (not this pack's) that show everywhere are
   * hidden, as a country manager would hide them there: the country's own stories take their place.
   */
  hideGlobalExamplesIn: z.array(CodeSchema).default([]),
  files: z.array(PackFileSchema),
});
export type Pack = z.infer<typeof PackSchema>;

/** The files of a landing picture, as LandingImagesService stores them. */
export function landingFiles(image: LandingImage): string[] {
  return image.widths.map((w) => `${image.path}-${w}.webp`);
}

/** Every landing picture of a pack's country: slot, language and picture. */
export function landingImages(landing: PackLanding) {
  return Object.entries(landing.images).flatMap(([slot, set]) =>
    Object.entries(set ?? {}).map(([language, image]) => ({
      slot,
      language,
      image: image,
    })),
  );
}

/** Where the pack does not hold together; empty when it does. */
export function packProblems(pack: Pack): string[] {
  const problems: string[] = [];
  const books = new Map(pack.books.map((b) => [b.id, b]));
  const files = new Set(pack.files.map((f) => f.path));
  if (books.size !== pack.books.length) problems.push('a book is listed twice');
  if (files.size !== pack.files.length) problems.push('a file is listed twice');
  const languageOf = (id: string) => books.get(id)?.row.language;
  const keys = new Set<string>();
  for (const s of pack.samples) {
    const key = `${s.template}/${s.language}/${s.country}`;
    if (keys.has(key)) problems.push(`sample ${key} is listed twice`);
    keys.add(key);
    const book = books.get(s.book);
    if (!book)
      problems.push(`sample ${key}: book ${s.book} is not in the pack`);
    else if (book.template !== s.template)
      problems.push(`sample ${key}: book ${s.book} is not made from it`);
    else if (book.row.language !== s.language)
      problems.push(
        `sample ${key}: book ${s.book} is in ${String(book.row.language)}`,
      );
  }
  for (const e of pack.examples) {
    const languages = new Set<string>();
    for (const v of e.versions) {
      if (languages.has(v.language))
        problems.push(`example ${e.id}: two ${v.language} versions`);
      languages.add(v.language);
      if (!books.has(v.book))
        problems.push(`example ${e.id}: book ${v.book} is not in the pack`);
      else if (languageOf(v.book) !== v.language)
        problems.push(
          `example ${e.id}: book ${v.book} is not in ${v.language}`,
        );
    }
  }
  const exampleBooks = pack.examples.flatMap((e) =>
    e.versions.map((v) => v.book),
  );
  if (new Set(exampleBooks).size !== exampleBooks.length)
    problems.push('a book is the version of two examples');
  const sampleBooks = pack.samples.map((s) => s.book);
  if (new Set(sampleBooks).size !== sampleBooks.length)
    problems.push('a book is the sample of two catalog books');
  for (const landing of pack.landing) {
    for (const { slot, language, image } of landingImages(landing)) {
      if (!image.path.startsWith(`landing/${landing.country}/`))
        problems.push(
          `landing ${landing.country} ${slot}/${language}: picture of another country`,
        );
      for (const file of landingFiles(image))
        if (!files.has(file))
          problems.push(
            `landing ${landing.country} ${slot}/${language}: ${file} is not in the pack`,
          );
      if (image.book && !books.has(image.book.id))
        problems.push(
          `landing ${landing.country} ${slot}/${language}: book ${image.book.id} is not in the pack`,
        );
    }
  }
  for (const book of pack.books) {
    if (book.row.status !== 'done')
      problems.push(`book ${book.id} is not finished`);
    const own = pack.files.filter((f) =>
      f.path.startsWith(`books/${book.id}/`),
    );
    if (!own.length) problems.push(`book ${book.id} has no files`);
    for (const path of bookPaths(book.row))
      if (!files.has(path))
        problems.push(`book ${book.id}: ${path} is not in the pack`);
  }
  return problems;
}

/** The stored files a book's row points to (pictures, the PDF, the photo page). */
export function bookPaths(row: Record<string, unknown>): string[] {
  const paths = [
    row.heroImagePath,
    row.toyPhotoPath,
    row.toyCutoutPath,
    row.toyImagePath,
    row.petImagePath,
    row.coverImagePath,
    row.pdfPath,
    // Every frame's picture (a picture book page's one, a comic page's panels).
    ...normalizePages(row.pages).flatMap(pageImagePaths),
    // Side characters' sheets.
    ...(Array.isArray(row.cast)
      ? (row.cast as { imagePath?: unknown }[]).map((c) => c?.imagePath)
      : []),
    (row.layout as { photo?: { path?: unknown } | null } | null)?.photo?.path,
  ];
  return paths.filter((p): p is string => typeof p === 'string' && !!p);
}

/** What the target database already has that the pack depends on or would touch. */
export interface Target {
  /** Published or not, by slug. */
  templates: ReadonlySet<string>;
  /** The countries the site offers. */
  offered: ReadonlySet<string>;
  /** Books with a pack book's id already there: their client key. */
  books: ReadonlyMap<string, string>;
}

/** Why the pack cannot go into this database; empty when it can. */
export function targetProblems(pack: Pack, target: Target): string[] {
  const problems: string[] = [];
  for (const book of pack.books) {
    if (book.template && !target.templates.has(book.template))
      problems.push(`book ${book.id}: no catalog book ${book.template}`);
    const key = target.books.get(book.id);
    if (
      key !== undefined &&
      key !== CONTENT_CLIENT_KEY &&
      key !== TRANSLATION_CLIENT_KEY
    )
      problems.push(
        `book ${book.id} is there already and is not staff content`,
      );
  }
  const countries = new Set([
    ...pack.samples.map((s) => s.country),
    ...pack.examples.flatMap((e) => e.countries),
    ...pack.landing.map((l) => l.country),
    ...pack.hideGlobalExamplesIn,
  ]);
  for (const code of countries)
    if (!target.offered.has(code))
      problems.push(`the site does not offer ${code}`);
  return problems;
}

/**
 * An example's own rule after hiding it in `countries` where it shows now (showcaseRule: its own
 * rule, else its catalog book's), as a country manager hides it (withCountry): "unchanged" when it
 * shows in none of them, "stuck" when hiding would empty an include list (which means everywhere).
 */
export function hiddenRule(
  own: CountryRule,
  template: CountryRule | null,
  countries: readonly string[],
): CountryRule | 'unchanged' | 'stuck' {
  let rule = showcaseRule(own, template);
  let changed = false;
  for (const country of countries) {
    if (!ruleShows(rule, country)) continue;
    const next = withCountry(rule, country, false);
    if (!next) return 'stuck';
    rule = next;
    changed = true;
  }
  return changed ? rule : 'unchanged';
}

/**
 * The landing overrides with the pack's: per country, its hero texts by language (a lead the pack
 * leaves out stays as it is) and its pictures by slot and language; the rest (FAQ, sections) stays.
 * `replaced` lists the pictures the pack's take the place of.
 */
export function mergeLanding(
  current: LandingOverrides,
  landing: readonly PackLanding[],
): { next: LandingOverrides; replaced: LandingImage[]; changed: string[] } {
  const next = structuredClone(current);
  const replaced: LandingImage[] = [];
  const changed: string[] = [];
  for (const own of landing) {
    const base = next[own.country] ?? CountryLandingSchema.parse({});
    const hero = { ...base.hero };
    for (const [language, text] of Object.entries(own.hero)) {
      const key = language as keyof typeof hero;
      const merged = { ...hero[key], ...stripEmpty(text ?? {}) };
      if (JSON.stringify(merged) !== JSON.stringify(hero[key]))
        changed.push(`${own.country} hero ${language}`);
      hero[key] = merged;
    }
    const images = structuredClone(base.images ?? {});
    for (const { slot, language, image } of landingImages(own)) {
      const set = { ...images[slot as keyof typeof images] };
      const old = set[language as keyof typeof set];
      if (old && JSON.stringify(old) === JSON.stringify(image)) continue;
      if (old) replaced.push(old);
      set[language as keyof typeof set] = image;
      images[slot as keyof typeof images] = set;
      changed.push(`${own.country} ${slot} ${language}`);
    }
    next[own.country] = CountryLandingSchema.parse({
      ...base,
      hero,
      ...(Object.keys(images).length && { images }),
    });
  }
  return { next: LandingOverridesSchema.parse(next), replaced, changed };
}

function stripEmpty(hero: { title?: string; lead?: string }) {
  return Object.fromEntries(
    Object.entries(hero).filter(([, v]) => typeof v === 'string' && v.trim()),
  );
}

/**
 * Places for the pack's examples that are new to the site: before every example there (the newest
 * on top, as staff adding them would), in the pack's order.
 */
export function newOrder(currentMin: number | null, count: number): number[] {
  const first = (currentMin ?? count) - count;
  return Array.from({ length: count }, (_, i) => first + i);
}

/** The client key a book gets in a pack: translations keep theirs, every other is content. */
export function packClientKey(clientKey: string): string {
  return clientKey === TRANSLATION_CLIENT_KEY ? clientKey : CONTENT_CLIENT_KEY;
}
