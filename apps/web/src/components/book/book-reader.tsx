"use client";

import { type Book } from "@fabulka/shared";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n/i18n";
import { type Highlight } from "@/lib/personalization";
import { type ReactNode, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { BookPage, BookStyles, PX_PER_MM, useRenderedBook } from "./book-pages";

/** A blank leaf back (the inside of a cover while it turns on a phone). */
function Blank() {
  return <div className="h-full w-full bg-[#fffaf3]" />;
}

/** The hint of a marked word (the sample book), shown over the word; portalled out of the page. */
interface Hint {
  text: string;
  x: number;
  y: number;
}

function HintBubble({ hint, id }: { hint: Hint; id: string }) {
  return createPortal(
    <span
      id={id}
      role="tooltip"
      style={{ left: Math.min(Math.max(hint.x, 124), window.innerWidth - 124), top: hint.y - 6 }}
      className="pointer-events-none fixed z-50 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-[#2b2118] px-2.5 py-1.5 text-center text-xs leading-snug font-semibold text-white shadow-lg"
    >
      {hint.text}
    </span>,
    document.fullscreenElement ?? document.body,
  );
}

const markOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("mark[data-hint]") : null);

interface Turn {
  direction: 1 | -1;
  to: number;
}

const FLIP_SECONDS = 0.7;
const FLIP_EASE = [0.45, 0, 0.25, 1] as const;

/**
 * The finished book as a picture book, exactly as it will be printed: the pages come from the same
 * renderer as the PDF (useRenderedBook), shown as two-page spreads on wide screens and one page at a
 * time on phones. Pages turn with a 3D flip that only animates while turning, so the page is idle
 * between turns. Arrow keys, clicks on either half and swipes turn pages. With `highlights`, the
 * words that came from the parent are marked and explained (a sample book).
 */
export function BookReader({ book, highlights }: { book: Book; highlights?: Highlight[] }) {
  const { t } = useI18n();
  const rendered = useRenderedBook(book, highlights);
  const { widthMm, heightMm } = book.layout.format;
  if (!rendered) {
    return (
      <section data-testid="book-reader-loading" className="flex flex-col items-center gap-4">
        <Skeleton as="div" radius="md" className="w-full max-w-[1000px]" style={{ aspectRatio: `${(2 * widthMm) / heightMm}` }} />
      </section>
    );
  }
  // Drawing pages added only to make the count a multiple of 4 carry a note on screen (not in print).
  const pages = rendered.pages.map((p) => (
    <div key={p.key} data-page-key={p.key} className="relative h-full w-full">
      <BookPage html={p.html} widthMm={widthMm} heightMm={heightMm} />
      {p.filler && (
        <span
          data-testid="filler-badge"
          className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold whitespace-nowrap text-white"
        >
          {t("reader.filler")}
        </span>
      )}
    </div>
  ));
  return <Reader pages={pages} widthMm={widthMm} heightMm={heightMm} theme={book.layout.theme.id} format={book.layout.format.id} pageCount={pages.length} />;
}

function Reader({
  pages,
  widthMm,
  heightMm,
  theme,
  format,
  pageCount,
}: {
  pages: ReactNode[];
  widthMm: number;
  heightMm: number;
  theme: string;
  format: string;
  pageCount: number;
}) {
  const { t } = useI18n();
  const wide = useMediaQuery("(min-width: 768px)", true);
  // Wide: view k shows pages 2k-1 (left) and 2k (right); view 0 is the cover alone.
  // Narrow: view k shows page k.
  const views = wide ? pages.length / 2 + 1 : pages.length;
  const [view, setView] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Until the reader turns a page, the cover's corner lifts now and then to show that it turns.
  const [turned, setTurned] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const hintId = useId();

  // Pages are laid out at their printed size and scaled to the page box: one page is half the book
  // on wide screens, all of it on phones.
  useLayoutEffect(() => {
    const element = bookRef.current;
    if (!element) return;
    const fit = () => {
      const pagePx = element.clientWidth / (wide ? 2 : 1);
      element.style.setProperty("--fb-scale", String(pagePx / (widthMm * PX_PER_MM)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [wide, widthMm]);

  const showHint = (mark: HTMLElement | null) => {
    if (!mark) return setHint(null);
    const box = mark.getBoundingClientRect();
    setHint({ text: mark.dataset.hint ?? "", x: box.left + box.width / 2, y: box.top });
  };

  // Switching between spread and single-page layout keeps roughly the same place in the book.
  const [layout, setLayout] = useState(wide);
  if (layout !== wide) {
    setLayout(wide);
    setView(wide ? Math.ceil(view / 2) : Math.max(0, view * 2 - 1));
    setTurn(null);
  }

  const go = (direction: 1 | -1) => {
    if (turn) return;
    const to = view + direction;
    if (to < 0 || to >= views) return;
    setTurned(true);
    setTurn({ direction, to });
  };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "ArrowRight") go(1);
    if (event.key === "ArrowLeft") go(-1);
  });

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  const page = (index: number) => pages[index] ?? null;
  const left = (v: number) => (wide && v > 0 ? page(2 * v - 1) : null);
  const right = (v: number) => (wide ? page(2 * v) : page(v));

  // While turning, the pages underneath already show where the turn ends; the leaf carries the
  // page being turned on its front and the page it reveals on its back.
  let underLeft = left(view);
  let underRight = right(view);
  let leaf: { front: ReactNode; back: ReactNode; side: "left" | "right" } | null = null;
  if (turn && wide) {
    if (turn.direction === 1) {
      underRight = right(turn.to);
      leaf = { front: right(view), back: left(turn.to), side: "right" };
    } else {
      underLeft = left(turn.to);
      leaf = { front: left(view), back: right(turn.to), side: "left" };
    }
  } else if (turn) {
    if (turn.direction === 1) {
      underRight = right(turn.to);
      leaf = { front: right(view), back: <Blank />, side: "right" };
    } else {
      leaf = { front: right(turn.to), back: <Blank />, side: "right" };
    }
  }
  // On a phone, turning back brings the previous page in from the left, so the leaf runs in reverse.
  const narrowBack = !wide && turn?.direction === -1;
  // Where the book is headed: the front cover alone shows on the right half, the back cover on
  // the left, so the book shifts by a quarter to keep the visible page centred.
  const target = turn ? turn.to : view;
  const shift = !wide ? "0%" : target === 0 ? "-25%" : target === views - 1 ? "25%" : "0%";

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen();
  };

  const half = "absolute top-0 h-full w-1/2";

  return (
    <motion.section
      data-testid="book-reader"
      data-theme={theme}
      data-format={format}
      data-pages={pageCount}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex flex-col items-center gap-4"
    >
      <div
        ref={frameRef}
        className={`flex w-full items-center justify-center ${fullscreen ? "h-full bg-[#1c1712] p-6" : ""}`}
      >
        <BookStyles />
        <motion.div
          ref={bookRef}
          className="relative cursor-pointer select-none [perspective:2400px]"
          style={{
            aspectRatio: `${((wide ? 2 : 1) * widthMm) / heightMm}`,
            width: wide ? `min(100%, 1000px, calc(85vh * ${(2 * widthMm) / heightMm}))` : `min(100%, calc(85vh * ${widthMm / heightMm}))`,
          }}
          onMouseOver={(event) => {
            const mark = markOf(event.target);
            if (mark || hint) showHint(mark);
          }}
          onFocus={(event) => showHint(markOf(event.target))}
          onBlur={() => setHint(null)}
          onMouseLeave={() => setHint(null)}
          // A closed book (front or back cover alone) sits in the middle and slides aside as it opens.
          initial={false}
          animate={{ x: shift }}
          transition={{ duration: FLIP_SECONDS, ease: FLIP_EASE }}
          onClick={(event) => {
            // A tap on a marked word shows its hint instead of turning the page.
            const mark = markOf(event.target);
            if (mark) return showHint(mark);
            const box = event.currentTarget.getBoundingClientRect();
            go(event.clientX - box.left > box.width / 2 ? 1 : -1);
          }}
          onTouchStart={(event) => (touchX.current = event.touches[0].clientX)}
          onTouchEnd={(event) => {
            if (touchX.current === null) return;
            const dx = event.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          {wide ? (
            <>
              {underLeft && <div className={`${half} left-0 overflow-hidden rounded-l-md shadow-xl`}>{underLeft}</div>}
              {underRight && <div className={`${half} left-1/2 overflow-hidden rounded-r-md shadow-xl`}>{underRight}</div>}
              {underLeft && underRight && (
                // The fold in the middle of an open book.
                <div className="pointer-events-none absolute top-0 left-1/2 h-full w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/10 to-transparent" />
              )}
            </>
          ) : (
            <div className="absolute inset-0 overflow-hidden rounded-md shadow-xl">{underRight}</div>
          )}

          {!turned && view === 0 && (
            <div
              aria-hidden
              className={`page-peel pointer-events-none absolute right-0 bottom-0 aspect-square rounded-br-md ${wide ? "w-[6%]" : "w-[12%]"}`}
            />
          )}

          {leaf && turn && (
            <motion.div
              key={`${view}-${turn.to}`}
              className={`absolute top-0 h-full [transform-style:preserve-3d] ${
                wide ? `w-1/2 ${leaf.side === "right" ? "left-1/2 origin-left" : "left-0 origin-right"}` : "inset-0 origin-left"
              }`}
              initial={{ rotateY: narrowBack ? -180 : 0 }}
              animate={{ rotateY: narrowBack ? 0 : leaf.side === "right" ? -180 : 180 }}
              transition={{ duration: FLIP_SECONDS, ease: FLIP_EASE }}
              onAnimationComplete={() => {
                setView(turn.to);
                setTurn(null);
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-md shadow-2xl [backface-visibility:hidden]">{leaf.front}</div>
              <div className="absolute inset-0 overflow-hidden rounded-md shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
                {leaf.back}
              </div>
            </motion.div>
          )}
        </motion.div>
        {hint && <HintBubble hint={hint} id={hintId} />}
      </div>

      <div className="flex items-center gap-3">
        <IconButton shape="round" size="md" label={t("reader.prev")} onClick={() => go(-1)} disabled={view === 0}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <span data-testid="reader-position" className="min-w-24 text-center text-sm text-muted">
          {view + 1} / {views}
        </span>
        <IconButton shape="round" size="md" label={t("reader.next")} data-testid="reader-next" onClick={() => go(1)} disabled={view >= views - 1}>
          <ChevronRight className="size-5" />
        </IconButton>
        <IconButton shape="round" size="md" label={t("reader.fullscreen")} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconButton>
      </div>
    </motion.section>
  );
}
