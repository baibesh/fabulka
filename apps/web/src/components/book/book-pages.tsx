"use client";

import { BOOK_CSS, renderBook, type Book, type RenderedBook } from "@fabulka/shared";
import { useEffect, useMemo, useState } from "react";
import { type Highlight, markPersonal } from "@/lib/personalization";
import { type Hyphenate, loadHyphenator } from "@/lib/hyphenate";
import "./book-fonts";

/** CSS pixels per millimetre: Chromium prints at 96 px to the inch, and lays out the same. */
export const PX_PER_MM = 96 / 25.4;

/**
 * The book's pages, rendered by the same renderer the API prints the PDF with (renderBook in
 * @fabulka/shared). Null until the language's hyphenation patterns have loaded, so the line breaks
 * are the printed ones from the first frame.
 */
/** What the renderer needs of a book: a real one, or a preview put together in the admin. */
export type PreviewableBook = Pick<Book, "title" | "childName" | "language" | "heroImageUrl" | "pages" | "talkQuestions" | "layout"> &
  Partial<Pick<Book, "coverImageUrl" | "blurb">>;

export function useRenderedBook(book: PreviewableBook, highlights?: Highlight[]): RenderedBook | null {
  const [hyphenate, setHyphenate] = useState<{ language: string; fn: Hyphenate } | null>(null);
  useEffect(() => {
    let live = true;
    void loadHyphenator(book.language).then((fn) => live && setHyphenate({ language: book.language, fn }));
    return () => {
      live = false;
    };
  }, [book.language]);

  const ready = hyphenate?.language === book.language;
  return useMemo(() => {
    if (!ready) return null;
    return renderBook(
      {
        title: book.title,
        childName: book.childName,
        language: book.language,
        heroImage: book.heroImageUrl,
        coverImage: book.coverImageUrl ?? null,
        blurb: book.blurb ?? null,
        pages: book.pages.map((p) => ({ page: p.page, text: p.text, image: p.imageUrl })),
        talkQuestions: book.talkQuestions,
      },
      book.layout,
      {
        hyphenate: hyphenate.fn,
        mark: highlights?.length ? (text) => markPersonal(text, highlights, book.language) : undefined,
      },
    );
  }, [ready, hyphenate, book, highlights]);
}

/** The book's CSS, once per document (React hoists and dedupes it). */
export function BookStyles() {
  return (
    <style href="fabulka-book" precedence="default">
      {BOOK_CSS}
    </style>
  );
}

/**
 * One page at its printed size in millimetres, scaled to its box by --fb-scale (set by the reader
 * from the box's width), so text wraps exactly as in the PDF.
 */
export function BookPage({ html, widthMm, heightMm }: { html: string; widthMm: number; heightMm: number }) {
  return (
    <div
      className="origin-top-left"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, transform: "scale(var(--fb-scale, 0))" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
