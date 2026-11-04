import type { Book as BookRow, Prisma } from '@prisma/client';
import {
  DedicationSchema,
  PhotoCaptionSchema,
  normalizePages,
  pageImagePaths,
  textRule,
  type BookLayout,
  type ChildProfile,
  type Language,
  type StoredPage,
  type StoryFormatData,
  type TextKind,
} from '@fabulka/shared';
import { basename } from 'node:path';
import { z } from 'zod';
import type { StoredCast } from '../books/books.service';
import type { TranslationBrief } from '../meta/prompts';

/** Books translated for «Examples» are staff's, not a visitor's: they never show in anyone's "My books". */
export const TRANSLATION_CLIENT_KEY = 'staff:example-translation';

/** What Muse Spark returns for a translated book (TRANSLATE_INSTRUCTIONS). */
export const BookTranslationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  child_name: z.string().trim().min(1).max(40),
  city: z.string().trim().max(60).default(''),
  toy_name: z.string().trim().max(60).nullable().default(null),
  pages: z.array(
    z.preprocess(
      // A page translated as one text (the shape before formats) is its narration.
      (raw) =>
        raw && typeof raw === 'object' && 'text' in raw && !('texts' in raw)
          ? {
              page: (raw as { page?: unknown }).page,
              texts: [{ id: '1.1', text: (raw as { text?: unknown }).text }],
            }
          : raw,
      z.object({
        page: z.number().int(),
        texts: z.array(
          z.object({
            id: z.string().trim().min(1),
            text: z.string().trim().min(1),
          }),
        ),
      }),
    ),
  ),
  talk_questions: z.array(z.string().trim().min(1)),
  dedication: z.string().trim().nullable().default(null),
  photo_caption: z.string().trim().nullable().default(null),
  blurb: z.string().trim().nullable().default(null).catch(null),
});
export type BookTranslation = z.infer<typeof BookTranslationSchema>;

/**
 * Why a translation does not fit the book it was made from, or null when it does: the same pages
 * in the same order, as many talk questions, a dedication and a caption exactly where the original
 * has them. Asked of the model again with this reason.
 */
export function translationProblem(
  brief: TranslationBrief,
  translation: BookTranslation,
): string | null {
  const want = brief.pages.map((p) => p.page).join(',');
  const got = translation.pages.map((p) => p.page).join(',');
  if (want !== got)
    return `"pages" must be pages ${want} in this order, got ${got || 'none'}`;
  for (const [i, page] of brief.pages.entries()) {
    const ids = page.texts.map((t) => t.id).join(',');
    const back = translation.pages[i].texts.map((t) => t.id).join(',');
    if (ids !== back)
      return `page ${page.page} must have texts ${ids} in this order, got ${back || 'none'}`;
  }
  if (translation.talk_questions.length !== brief.talkQuestions.length)
    return `"talk_questions" must have ${brief.talkQuestions.length} questions, got ${translation.talk_questions.length}`;
  if (brief.dedication && !translation.dedication)
    return '"dedication" must be translated, not null';
  if (brief.photoCaption && !translation.photo_caption)
    return '"photo_caption" must be translated, not null';
  return null;
}

/** What a book is translated from, as a row with its catalog book's theme. */
export type SourceRow = BookRow;

/** Where a source book's file goes in the new book's folder: same name, its own copy. */
export function relocate(path: string, bookId: string): string {
  return `books/${bookId}/${basename(path)}`;
}

/**
 * Every file of the source book the translation reuses, and where its copy goes: the character
 * sheets, the toy's photo and cut-out, every page picture and the parent's photo. Pictures carry no
 * text (the image prompts say so), so they serve any language; they are copied, not shared, because
 * deleting a book deletes its folder, and the renderer reads pictures from the book's own folder.
 */
export function copyPlan(
  source: SourceRow,
  bookId: string,
): { from: string; to: string }[] {
  const layout = source.layout as { photo?: { path?: string } | null } | null;
  const paths = [
    source.heroImagePath,
    source.petImagePath,
    source.toyImagePath,
    source.toyPhotoPath,
    source.toyCutoutPath,
    source.coverImagePath,
    ...castOf(source).map((c) => c.imagePath),
    ...normalizePages(source.pages).flatMap(pageImagePaths),
    layout?.photo?.path ?? null,
  ].filter((path): path is string => Boolean(path));
  return [...new Set(paths)].map((from) => ({
    from,
    to: relocate(from, bookId),
  }));
}

/** What Muse Spark is given to translate the source book into `to`. */
export function translationBrief(
  source: SourceRow,
  to: Language,
  layout: BookLayout,
  wordsPerPage: number,
  format?: Pick<StoryFormatData, 'textRules'>,
): TranslationBrief {
  const kinds: TextKind[] = ['caption', 'speech', 'sfx'];
  const child = source.child as unknown as ChildProfile;
  return {
    from: source.language as Language,
    to,
    child: {
      name: child.name,
      age: child.age,
      gender: child.gender,
      city: child.city,
    },
    toyName: source.toyName,
    title: source.title ?? '',
    pages: normalizePages(source.pages).map((p) => ({
      page: p.page,
      texts: p.texts.map((t) => ({ id: t.id, kind: t.kind, text: t.text })),
    })),
    talkQuestions: source.talkQuestions as string[],
    dedication: layout.dedication,
    photoCaption: layout.photo?.caption ?? null,
    blurb: source.blurb,
    wordsPerPage,
    limits: Object.fromEntries(
      kinds.flatMap((kind) => {
        const rule = format ? textRule(format, kind) : null;
        return rule ? [[kind, rule.maxWords]] : [];
      }),
    ),
  };
}

/** A book's cast (Book.cast) as stored. */
export function castOf(row: Pick<BookRow, 'cast'>): StoredCast[] {
  return Array.isArray(row.cast) ? (row.cast as unknown as StoredCast[]) : [];
}

/** The new book's row before anything is translated: the source's story, staff's, in `language`. */
export function translationRow(
  source: SourceRow,
  language: Language,
): Prisma.BookUncheckedCreateInput {
  const child = source.child as unknown as ChildProfile;
  return {
    status: 'queued',
    child: { ...child, language },
    language,
    methodology: source.methodology,
    storyFormat: source.storyFormat,
    theme: source.theme,
    templateId: source.templateId,
    answers: source.answers ?? undefined,
    heroDescription: source.heroDescription,
    toyName: source.toyName,
    toyDescription: source.toyDescription,
    clientKey: TRANSLATION_CLIENT_KEY,
    // Made by staff: counted against the demo cap, never against a visitor's free books.
    demo: true,
    // The source's country: a country manager who translated it may open it.
    country: source.country,
  };
}

/**
 * The translated book: the source's pages with the translated text and the copied pictures, the
 * child's name in the new script (also where the book prints it: the cover, the default dedication),
 * the toy's name, the talk questions, and the layout's own texts (the parent's dedication, the photo
 * caption) translated. Page layouts keep staff's pins and the parent's picks; what render QA found
 * for the old text is cleared, since the new text is measured afresh.
 */
export function assembleTranslation(
  source: SourceRow,
  translation: BookTranslation,
  language: Language,
  bookId: string,
  layout: BookLayout,
) {
  const child = source.child as unknown as ChildProfile;
  const texts = new Map(
    translation.pages.flatMap((p) =>
      p.texts.map((t) => [`${p.page}:${t.id}`, t.text] as const),
    ),
  );
  const moved = (path: string | null) => (path ? relocate(path, bookId) : null);
  // The same pictures (copied), every text element translated: narration, balloons, captions, sounds.
  const pages: StoredPage[] = normalizePages(source.pages).map((p) => ({
    ...p,
    frames: p.frames.map((f) => ({ ...f, imagePath: moved(f.imagePath) })),
    texts: p.texts.map((t) => ({
      ...t,
      text: texts.get(`${p.page}:${t.id}`) ?? t.text,
    })),
  }));
  const dedication =
    layout.dedication === null || !translation.dedication
      ? null
      : (DedicationSchema.safeParse(translation.dedication).data ?? null);
  const caption =
    layout.photo?.caption && translation.photo_caption
      ? (PhotoCaptionSchema.safeParse(translation.photo_caption).data ?? null)
      : null;
  const translatedLayout: BookLayout = {
    ...layout,
    dedication,
    photo: layout.photo
      ? { ...layout.photo, path: relocate(layout.photo.path, bookId), caption }
      : null,
    pages: Object.fromEntries(
      Object.entries(layout.pages).map(([page, state]) => [
        page,
        { ...state, tooFull: [] },
      ]),
    ),
    fits: {},
    qa: { status: 'pending', checkedAt: null, issues: [], notes: [] },
  };
  return {
    title: translation.title,
    language,
    child: {
      ...child,
      name: translation.child_name,
      city: translation.city || child.city,
      language,
    } satisfies ChildProfile,
    toyName: source.toyName ? (translation.toy_name ?? source.toyName) : null,
    pages,
    talkQuestions: translation.talk_questions,
    heroImagePath: moved(source.heroImagePath),
    petImagePath: moved(source.petImagePath),
    toyImagePath: moved(source.toyImagePath),
    toyPhotoPath: moved(source.toyPhotoPath),
    toyCutoutPath: moved(source.toyCutoutPath),
    coverImagePath: moved(source.coverImagePath),
    coverSubject: source.coverSubject,
    coverTone: source.coverTone,
    blurb: source.blurb ? (translation.blurb ?? null) : null,
    cast: castOf(source).map((c) => ({ ...c, imagePath: moved(c.imagePath) })),
    layout: translatedLayout,
  };
}

/**
 * Picture book pages whose text still overflows after render QA (a two-page layout's either half),
 * by number; a panel page's overflowing balloon names its element and is shortened on its own.
 */
export function overflowingPages(layout: BookLayout): number[] {
  return [
    ...new Set(
      layout.qa.issues
        .map((i) =>
          i.kind === 'overflow' && !i.element
            ? /^story-(\d+)/.exec(i.page)
            : null,
        )
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1])),
    ),
  ];
}
