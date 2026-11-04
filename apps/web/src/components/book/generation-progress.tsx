"use client";

import {
  STEP_MODELS,
  etaPhrase,
  generationView,
  stateOfStatus,
  steadyEta,
  TYPICAL_SECONDS,
  type Book,
  type BookPage,
  type GenerationStep,
  type GenerationView,
  type StepState,
} from "@fabulka/shared";
import { Check, Loader2, Lock, Pencil, Sparkles } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "@/i18n/i18n";
import type { MessageKey } from "@/i18n/messages";
import { cx } from "../ui/cx";

/**
 * The book's generation as the API reports it; an older API's answer (no `generation`) is read off
 * the status, so the screen still shows its steps.
 */
function viewOf(book: Book): GenerationView {
  if (book.generation) return book.generation;
  const frames = book.pages.flatMap(framesOf);
  const state = stateOfStatus(book.status, {
    toy: !!book.toy,
    pet: false,
    pages: book.pages.length,
    since: book.createdAt,
  });
  return generationView(
    { ...state, frames: frames.length },
    { pagesDone: book.pages.filter(pageDrawn).length, framesDone: frames.filter((f) => f.imageUrl || f.vignette).length, petImageUrl: null },
    TYPICAL_SECONDS,
    Date.now(),
  );
}

/** A page's frames; an older API's page is one frame, its picture. */
const framesOf = (page: Pick<BookPage, "imageUrl" | "vignette" | "frames">): { imageUrl: string | null; vignette?: boolean }[] =>
  page.frames ?? [{ imageUrl: page.imageUrl, vignette: page.vignette }];

/** Every frame of the page is drawn (or was refused in every version): a comic page counts once all its panels are. */
const pageDrawn = (page: Pick<BookPage, "imageUrl" | "vignette" | "frames">) => framesOf(page).every((f) => f.imageUrl || f.vignette);

/** A step's name for the parent; the friends' step says whose sheets are drawn. */
function stepKey(step: GenerationStep, view: GenerationView): MessageKey {
  if (step !== "friends") return `book.step.${step}`;
  if (view.toy && view.pet) return "book.step.friends.both";
  return view.toy ? "book.step.friends.toy" : "book.step.friends.pet";
}

/**
 * The time left as the screen shows it: a lower estimate at once, small rises ignored (steadyEta), so
 * it reads calmly between polls. It is adjusted while rendering, React's way of deriving state.
 */
function useSteadyEta(next: number | null): number | null {
  const [eta, setEta] = useState({ source: next, shown: next });
  if (eta.source !== next) {
    const shown = steadyEta(eta.shown, next);
    setEta({ source: next, shown });
    return shown;
  }
  return eta.shown;
}

function EtaText({ seconds }: { seconds: number | null }) {
  const { t } = useI18n();
  const shown = useSteadyEta(seconds);
  if (shown === null) return null;
  const phrase = etaPhrase(shown);
  const text =
    phrase.kind === "soon" ? t("book.eta.soon") : phrase.kind === "underMinute" ? t("book.eta.underMinute") : t("book.eta.minutes", { n: phrase.minutes });
  return (
    <p data-testid="book-eta" data-seconds={shown} className="text-muted">
      {text}
    </p>
  );
}

/** The header while the book is being made: the running step, the time left and the bar. */
export function GenerationHeader({ book }: { book: Book }) {
  const { t } = useI18n();
  const view = viewOf(book);
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2 text-lg font-bold">
            <Sparkles className="size-5 shrink-0 text-accent" aria-hidden />
            <span data-testid="book-stage" data-step={view.step}>
              {t(stepKey(view.step, view))}
            </span>
          </div>
          <EtaText seconds={view.etaSeconds} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border" aria-hidden>
          <motion.div className="h-full bg-accent" animate={{ width: `${book.progress}%` }} transition={{ duration: 0.8 }} />
        </div>
      </div>
    </MotionConfig>
  );
}

/** While the book is being made: every step in order beside the artwork as it arrives. */
export function GenerationBoard({ book }: { book: Book }) {
  const { t } = useI18n();
  const view = viewOf(book);
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4">
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8">
          <Stepper view={view} />
          <LiveArt book={book} view={view} />
        </div>
        <p className="text-sm text-muted">{t("book.wait.note")}</p>
      </div>
    </MotionConfig>
  );
}

function Stepper({ view }: { view: GenerationView }) {
  const { t, locale } = useI18n();
  return (
    <ol data-testid="generation-steps" aria-label={t("book.steps.label")} className="flex min-w-0 flex-col">
      {view.steps.map(({ id, state }, i) => (
        <li
          key={id}
          data-testid="generation-step"
          data-step={id}
          data-state={state}
          aria-current={state === "current" ? "step" : undefined}
          className="relative flex gap-3 pb-4 last:pb-0"
        >
          {i < view.steps.length - 1 && (
            <span aria-hidden className={cx("absolute top-7 bottom-0 left-[0.6875rem] w-0.5 rounded-full", state === "done" ? "bg-success/60" : "bg-border")} />
          )}
          <StepIcon state={state} />
          <div className={cx("flex min-w-0 flex-col pt-0.5", state === "next" && "opacity-55")}>
            <span className={cx("leading-snug", state === "current" ? "font-bold" : state === "done" ? "font-medium" : "")}>{t(stepKey(id, view))}</span>
            {id === "pages" && state !== "next" && view.pagesTotal > 0 && (
              <span data-testid="pages-count" className="text-sm text-muted">
                {t("book.step.pagesCount", { done: view.pagesDone, total: view.pagesTotal })}
              </span>
            )}
            {/* Panels: more pictures than pages, so the pictures are counted too. */}
            {id === "pages" && state !== "next" && view.framesTotal > view.pagesTotal && (
              <span data-testid="frames-count" className="text-sm text-muted">
                {t("book.step.framesCount", { done: view.framesDone, total: view.framesTotal })}
              </span>
            )}
            {/* The photo path: the child's photo is gone once the hero's sheet exists (or it was given up). */}
            {view.photo && view.photoDeletedAt && id === "hero" && (
              <span data-testid="photo-deleted" className="flex items-center gap-1 text-sm font-semibold text-success">
                <Lock className="size-3.5" aria-hidden />
                {t("book.photo.deleted", { time: new Date(view.photoDeletedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })}
              </span>
            )}
            {STEP_MODELS[id] && <span className="text-xs tracking-wide text-muted/80">{STEP_MODELS[id]}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-success text-white"
      >
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </motion.span>
    );
  if (state === "current")
    return (
      <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
      </span>
    );
  return <span aria-hidden className="relative z-10 mt-1 ml-1 size-4 shrink-0 rounded-full border-2 border-border bg-background" />;
}

/** The hero's (and pet's) sheet as soon as it exists, then a thumbnail for every page as it is drawn. */
function LiveArt({ book, view }: { book: Book; view: GenerationView }) {
  const { t } = useI18n();
  const heroNext = view.steps.find((s) => s.id === "hero")?.state;
  const total = Math.max(view.pagesTotal, book.pages.length);
  const pages = Array.from({ length: total }, (_, i) => book.pages[i] ?? { page: i + 1, text: "", imageUrl: null });
  return (
    <section data-testid="live-art" className="flex min-w-0 flex-col gap-4">
      <h2 className="font-bold">{t("book.live.title")}</h2>
      <div className="flex flex-wrap gap-3">
        <Sheet testId="hero-image" url={book.heroImageUrl} label={t("book.live.hero")} busy={heroNext === "current"} alt={t("book.heroAlt")} />
        {view.pet && <Sheet testId="pet-image" url={view.petImageUrl} label={t("book.live.pet")} busy={view.step === "friends"} alt={t("book.live.pet")} />}
      </div>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
        {pages.map((page) => {
          // A page shows its first drawn picture once every one of its frames is in.
          const drawn = pageDrawn(page);
          const imageUrl = drawn ? (framesOf(page).find((f) => f.imageUrl)?.imageUrl ?? null) : null;
          return (
            <Thumb
              key={page.page}
              page={page.page}
              imageUrl={imageUrl}
              vignette={drawn && !imageUrl}
              heroUrl={book.heroImageUrl}
              state={
                imageUrl
                  ? "done"
                  : drawn
                    ? "vignette"
                    : view.redrawing.includes(page.page)
                      ? "redrawing"
                      : view.drawing.includes(page.page)
                        ? "drawing"
                        : "waiting"
              }
            />
          );
        })}
      </ol>
    </section>
  );
}

function Sheet({ testId, url, label, busy, alt }: { testId: string; url: string | null; label: string; busy: boolean; alt: string }) {
  return (
    <figure className="flex w-24 flex-col items-center gap-1 sm:w-28">
      <div className={cx("relative aspect-square w-full overflow-hidden rounded-2xl border", url ? "border-border bg-white" : "border-dashed border-border")}>
        <AnimatePresence>
          {url ? (
            <motion.img
              key={url}
              data-testid={testId}
              src={url}
              alt={alt}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="size-full object-contain"
            />
          ) : (
            <div aria-hidden className={cx("grid size-full place-items-center text-accent", busy && "bg-border/40 motion-safe:animate-pulse")}>
              {busy && <Pencil className="size-5" />}
            </div>
          )}
        </AnimatePresence>
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

type ThumbState = "done" | "vignette" | "redrawing" | "drawing" | "waiting";

function Thumb({ page, imageUrl, vignette, heroUrl, state }: { page: number; imageUrl: string | null; vignette: boolean; heroUrl: string | null; state: ThumbState }) {
  const { t } = useI18n();
  const caption =
    state === "redrawing"
      ? t("book.page.redrawing", { page })
      : state === "drawing"
        ? t("book.page.drawing", { page })
        : state === "vignette"
          ? t("book.page.vignette", { page })
          : t("book.page.waiting", { page });
  return (
    <li data-testid="book-page" data-page={page} data-state={state} className="flex min-w-0 flex-col gap-1">
      <div
        className={cx(
          "relative aspect-[4/3] w-full overflow-hidden rounded-xl border",
          state === "waiting" ? "border-dashed border-border bg-transparent" : "border-border bg-card",
        )}
      >
        {imageUrl ? (
          <motion.img
            key={imageUrl}
            src={imageUrl}
            alt={t("book.pageAlt", { page })}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="size-full object-cover"
          />
        ) : vignette && heroUrl ? (
          // Every version of the scene was refused: the page carries the hero's portrait, as in the book.
          <div className="grid size-full place-items-center bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API */}
            <img src={heroUrl} alt={t("book.page.vignette", { page })} className="h-3/4 w-auto object-contain" />
          </div>
        ) : (
          <div
            aria-hidden
            className={cx(
              "grid size-full place-items-center",
              state === "waiting" ? "text-muted/60" : "bg-border/40 text-accent motion-safe:animate-pulse",
            )}
          >
            {state === "waiting" ? <span className="text-sm font-semibold">{page}</span> : <Pencil className="size-4" />}
          </div>
        )}
      </div>
      <span className={cx("line-clamp-2 text-xs", state === "redrawing" ? "text-accent" : "text-muted")} data-testid={state === "redrawing" ? "page-redrawing" : undefined}>
        {caption}
      </span>
    </li>
  );
}
