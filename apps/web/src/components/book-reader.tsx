"use client";

import { BOOK_LABELS, type Book } from "@fabulka/shared";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { motion } from "motion/react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useI18n } from "@/i18n/i18n";
import { type Highlight, markPersonal } from "@/lib/personalization";
import { type ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./ui/button";

/** One page. Pages keep paper colors in dark mode: it is a printed book, not app chrome. */
function Page({ hard, className = "", children }: { hard?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={`@container h-full w-full text-[#2b2118] ${hard ? "bg-[#fdf1e2]" : "bg-[#fffaf3]"} ${className}`}>
      {children}
    </div>
  );
}

/**
 * A word that will be the parent's own in their book; its hint shows on hover, focus or a tap. The
 * hint is portalled out of the page, whose overflow would clip it near the edges.
 */
function Mark({ text, hint }: { text: string; hint: string }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setAt({ x: box.left + box.width / 2, y: box.top });
  };

  // The hint is fixed on screen, so it follows the word while the page scrolls.
  const open = at !== null;
  const follow = useEffectEvent(show);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => follow();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <mark
      ref={ref}
      data-testid="sample-highlight"
      tabIndex={0}
      aria-describedby={at ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
      // A tap shows the hint instead of turning the page.
      onClick={(event) => {
        event.stopPropagation();
        show();
      }}
      className="cursor-help rounded-[0.2em] bg-[#e8833a]/20 px-[0.1em] text-inherit underline decoration-[#e8833a]/70 decoration-dotted underline-offset-[0.2em] outline-none focus-visible:ring-2 focus-visible:ring-[#e8833a]"
    >
      {text}
      {at &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ left: Math.min(Math.max(at.x, 124), window.innerWidth - 124), top: at.y - 6 }}
            className="pointer-events-none fixed z-50 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-[#2b2118] px-2.5 py-1.5 text-center text-xs leading-snug font-semibold text-white shadow-lg"
          >
            {hint}
          </span>,
          document.fullscreenElement ?? document.body,
        )}
    </mark>
  );
}

/** Text with the highlighted words marked, or as is without highlights. */
function personal(text: string, highlights: Highlight[] | undefined): ReactNode {
  if (!highlights?.length) return text;
  return markPersonal(text, highlights).map((piece, i) =>
    typeof piece === "string" ? piece : <Mark key={i} text={piece.text} hint={piece.hint} />,
  );
}

/** The pages of a book in reading order: cover, opening spread, illustration and text per page, the end. */
function bookPages(book: Book, highlights?: Highlight[]): ReactNode[] {
  const labels = BOOK_LABELS[book.language];
  const mark = (text: string) => personal(text, highlights);
  const pages: ReactNode[] = [
    <Page key="cover" hard className="flex flex-col items-center justify-center gap-[5%] p-[8%] text-center">
      {book.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
        <img src={book.heroImageUrl} alt="" className="h-[58%] w-[58%] rounded-[6%] bg-white object-contain shadow-md" />
      )}
      <h2 className="text-[6.5cqw] font-extrabold leading-tight">{book.title && mark(book.title)}</h2>
    </Page>,
    <Page key="dedication" className="flex flex-col items-center justify-center gap-4 p-[10%] text-center">
      <span className="text-[9cqw] text-[#e8833a]">✦</span>
      <p className="text-[5.5cqw] font-bold leading-snug">{mark(labels.madeFor(book.childName))}</p>
    </Page>,
    <Page key="hero" className="flex flex-col items-center justify-center gap-[4%] p-[10%] text-center">
      {book.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
        <img src={book.heroImageUrl} alt="" className="h-[70%] w-[70%] object-contain" />
      )}
      <p className="text-[6cqw] font-extrabold">{mark(book.childName)}</p>
    </Page>,
  ];
  for (const page of book.pages) {
    pages.push(
      <Page key={`art-${page.page}`} className="flex items-center justify-center p-[6%]">
        {page.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
          <img src={page.imageUrl} alt="" className="w-full rounded-[4%] object-contain shadow-sm" />
        ) : (
          <div className="aspect-[3/2] w-full rounded-[4%] bg-[#eadfce]" />
        )}
      </Page>,
      <Page key={`text-${page.page}`} className="relative flex items-center p-[11%]">
        <p className="text-[4.6cqw] leading-relaxed">{mark(page.text)}</p>
        <span className="absolute right-[8%] bottom-[6%] text-[2.6cqw] text-[#b3a493]">{page.page}</span>
      </Page>,
    );
  }
  if (book.talkQuestions.length) {
    pages.push(
      <Page key="talk" className="flex flex-col justify-center gap-4 p-[10%]">
        <h3 className="text-[5.5cqw] font-extrabold">{labels.talk}</h3>
        <ol className="list-decimal space-y-2 pl-5 text-[3.6cqw] leading-snug">
          {book.talkQuestions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ol>
      </Page>,
    );
  }
  // The back cover must land on a left page: an odd number of pages before it.
  if (pages.length % 2 === 0) pages.push(<Page key="blank" />);
  pages.push(
    <Page key="end" hard className="flex flex-col items-center justify-center gap-3 text-center">
      <p className="text-[9cqw] font-extrabold">{labels.end}</p>
      <p className="text-[2.6cqw] text-[#7a6a5c]">Powered by Meta Muse models</p>
    </Page>,
  );
  return pages;
}


interface Turn {
  direction: 1 | -1;
  to: number;
}

const FLIP_SECONDS = 0.7;
const FLIP_EASE = [0.45, 0, 0.25, 1] as const;

/**
 * The finished book as a picture book: a two-page spread on wide screens (illustration left, text
 * right), one page at a time on phones. Pages turn with a 3D flip that only animates while turning,
 * so the page is idle between turns. Arrow keys, clicks on either half and swipes turn pages.
 * With `highlights`, the words that came from the parent are marked and explained (a sample book).
 */
export function BookReader({ book, highlights }: { book: Book; highlights?: Highlight[] }) {
  const { t } = useI18n();
  const pages = bookPages(book, highlights);
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
  const touchX = useRef<number | null>(null);

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
      leaf = { front: right(view), back: <Page />, side: "right" };
    } else {
      leaf = { front: right(turn.to), back: <Page />, side: "right" };
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
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex flex-col items-center gap-4"
    >
      <div
        ref={frameRef}
        className={`flex w-full items-center justify-center ${fullscreen ? "h-full bg-[#1c1712] p-6" : ""}`}
      >
        <motion.div
          className={`relative cursor-pointer select-none [perspective:2400px] ${wide ? "aspect-[2/1]" : "aspect-square"}`}
          style={{ width: wide ? "min(100%, 1000px, calc(85vh * 2))" : "min(100%, 85vh)" }}
          // A closed book (front or back cover alone) sits in the middle and slides aside as it opens.
          initial={false}
          animate={{ x: shift }}
          transition={{ duration: FLIP_SECONDS, ease: FLIP_EASE }}
          onClick={(event) => {
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
