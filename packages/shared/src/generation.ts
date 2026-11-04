import { z } from "zod";
import type { BookStatus } from "./index";
import { FRAME_CONCURRENCY } from "./formats";

// ---- Generation progress ---------------------------------------------------------------------
//
// What the progress screen shows while a book is being made: every real step of the pipeline in
// order (BooksService.generate), which one is running, the pages drawn so far and an honest
// estimate of the time left. The API keeps a small state on the book (GenerationState) and turns it
// into a view (GenerationView) on every GET; books made before it are derived from their status.

/**
 * The steps of making a book, in order. "toy" runs only with a toy photo, "friends" (the pet's and
 * the toy's character sheets) only when the story has a pet or the parent sent a toy.
 */
export const GENERATION_STEPS = [
  /** The answers are taken in; also while the book waits for a free slot. */
  "read",
  /** SAM 3.1 cuts the toy out of the photo, Muse Spark describes it for the story. */
  "toy",
  /** Muse Spark writes the story. */
  "story",
  /** Muse Spark reads it again before any picture is drawn (safety and age). */
  "review",
  /** Muse Image draws the hero's character sheet. */
  "hero",
  /** Muse Image draws the pet's, the toy's and the side characters' sheets. */
  "friends",
  /** Muse Image draws every page's frames (a few at once); SAM 3.1 finds the characters in each. */
  "pages",
  /** The pages are laid out around SAM's masks and checked in a browser (render QA). */
  "check",
  /** The PDF is printed. */
  "pdf",
] as const;
export const GenerationStepSchema = z.enum(GENERATION_STEPS);
export type GenerationStep = z.infer<typeof GenerationStepSchema>;

/** The Meta model behind each step, named quietly on the progress screen (null: no model). */
export const STEP_MODELS: Record<GenerationStep, string | null> = {
  read: null,
  toy: "SAM 3.1 · Muse Spark",
  story: "Muse Spark",
  review: "Muse Spark",
  hero: "Muse Image",
  friends: "Muse Image",
  pages: "Muse Image · SAM 3.1",
  check: "SAM 3.1",
  pdf: null,
};

/**
 * Pages drawn at once (all the frames of a page together, FRAME_CONCURRENCY frames at most); each
 * frame chains from the character sheets, not from the others.
 */
export const PAGE_CONCURRENCY = 4;

/** What the API keeps on Book.generation while the book is being made. */
export const GenerationStateSchema = z.object({
  step: GenerationStepSchema,
  /** The parent sent a toy photo. */
  toy: z.boolean(),
  /** The book has a pet sheet: the child's profile names a pet until the story says. */
  pet: z.boolean(),
  /** Pages planned, then as many as the story wrote. */
  pages: z.number().int().min(0),
  /** Pictures the pages need: one a page in a picture book, every panel in a comic (left out: one a page). */
  frames: z.number().int().min(0).optional(),
  /** Side characters drawn on sheets of their own in the "friends" step (the format's cast sheets). */
  cast: z.number().int().min(0).default(0),
  /** Pages whose picture is being drawn right now. */
  drawing: z.array(z.number().int()).default([]),
  /** Of those, pages drawn again after the picture was refused (gentler, then rewritten). */
  redrawing: z.array(z.number().int()).default([]),
  /** When generation left the queue (ISO); null while it waits. */
  startedAt: z.string().nullable().default(null),
  /** When the current step began (ISO). */
  stepAt: z.string(),
});
export type GenerationState = z.infer<typeof GenerationStateSchema>;

export const STEP_STATES = ["done", "current", "next"] as const;
export type StepState = (typeof STEP_STATES)[number];

/** Book.generation in the API's answer: present only while the book is being made. */
export const GenerationViewSchema = z.object({
  steps: z.array(z.object({ id: GenerationStepSchema, state: z.enum(STEP_STATES) })),
  /** The running step. */
  step: GenerationStepSchema,
  /** The book has a toy photo / a pet: which character sheets the "friends" step draws. */
  toy: z.boolean(),
  pet: z.boolean(),
  pagesDone: z.number().int().min(0),
  pagesTotal: z.number().int().min(0),
  /** Pictures drawn of all the pages need (frames; a picture book has one a page). */
  framesDone: z.number().int().min(0).default(0),
  framesTotal: z.number().int().min(0).default(0),
  drawing: z.array(z.number().int()),
  redrawing: z.array(z.number().int()),
  /** The pet's character sheet once drawn (the toy's is in Book.toy). */
  petImageUrl: z.string().nullable(),
  /** About how many seconds are left, in steps of 5 (so unchanged answers stay the same). */
  etaSeconds: z.number().int().min(0).nullable(),
});
export type GenerationView = z.infer<typeof GenerationViewSchema>;

/** The steps this book goes through, in order. */
export function stepsFor(state: Pick<GenerationState, "toy" | "pet"> & { cast?: number }): GenerationStep[] {
  return GENERATION_STEPS.filter((step) => {
    if (step === "toy") return state.toy;
    if (step === "friends") return state.toy || state.pet || (state.cast ?? 0) > 0;
    return true;
  });
}

/** Pictures the pages step draws: the frames, or one a page for a state kept before frames. */
export const framesOf = (state: Pick<GenerationState, "pages" | "frames">) => state.frames ?? state.pages;

/** The step a status stands for, for books that have no generation state. */
export function stepOfStatus(status: BookStatus): GenerationStep {
  switch (status) {
    case "toy":
      return "toy";
    case "story":
      return "story";
    case "hero":
      return "hero";
    case "pages":
      return "pages";
    case "pdf":
    case "done":
    case "failed":
      return "pdf";
    default:
      return "read";
  }
}

/** The book's status while a step runs (the coarse stage older clients and the admin show). */
export function statusOfStep(step: GenerationStep): BookStatus {
  switch (step) {
    case "read":
      return "queued";
    case "toy":
      return "toy";
    case "story":
    case "review":
      return "story";
    case "hero":
    case "friends":
      return "hero";
    case "pages":
      return "pages";
    case "check":
    case "pdf":
      return "pdf";
  }
}

/** Each step of the book with whether it is done, running or still to come. */
export function stepStates(steps: GenerationStep[], current: GenerationStep): { id: GenerationStep; state: StepState }[] {
  const at = steps.indexOf(current);
  return steps.map((id, i) => ({ id, state: i < at ? "done" : i === at ? "current" : "next" }));
}

/**
 * Typical seconds of each model call, from the journal's recent averages (fallback: TYPICAL_SECONDS).
 * `page` is one page picture, `pageMask` SAM's mask of it, `render` laying out, checking and printing.
 */
export const StepTimingsSchema = z.object({
  toyCutout: z.number().min(0),
  toyDescribe: z.number().min(0),
  story: z.number().min(0),
  review: z.number().min(0),
  hero: z.number().min(0),
  pet: z.number().min(0),
  toySheet: z.number().min(0),
  page: z.number().min(0),
  pageMask: z.number().min(0),
  render: z.number().min(0),
});
export type StepTimings = z.infer<typeof StepTimingsSchema>;

/** Measured on the live service (November 2026); used until the journal has enough calls. */
export const TYPICAL_SECONDS: StepTimings = {
  toyCutout: 4,
  toyDescribe: 8,
  story: 31,
  review: 5,
  hero: 18,
  pet: 29,
  toySheet: 29,
  page: 34,
  pageMask: 2.5,
  render: 4,
};

/** Seconds a whole step usually takes for this book. */
export function stepSeconds(step: GenerationStep, state: Pick<GenerationState, "toy" | "pet" | "pages" | "frames"> & { cast?: number }, t: StepTimings): number {
  switch (step) {
    case "read":
      return 0;
    case "toy":
      return t.toyCutout + t.toyDescribe;
    case "story":
      // A scenario of panels is longer to write than one text a page: it grows with the frames a page.
      return t.story * Math.max(1, framesOf(state) / Math.max(1, state.pages));
    case "review":
      return t.review;
    case "hero":
      return t.hero;
    case "friends":
      return (state.pet ? t.pet : 0) + (state.toy ? t.toySheet : 0) + (state.cast ?? 0) * t.toySheet;
    case "pages":
      return waves(state) * (t.page + t.pageMask);
    case "check":
      return Math.max(t.render - 1, 0.5);
    case "pdf":
      return Math.min(t.render, 1);
  }
}

/**
 * How many rounds the pages step draws in: a picture book PAGE_CONCURRENCY pages at once, panels
 * FRAME_CONCURRENCY frames at once.
 */
function waves(state: Pick<GenerationState, "pages" | "frames">, left = framesOf(state)): number {
  const frames = framesOf(state);
  const atOnce = frames > state.pages ? FRAME_CONCURRENCY : PAGE_CONCURRENCY;
  return Math.ceil(left / atOnce);
}

/**
 * The running step's time left. Measured from when it began; a step running late is not counted as
 * finished, it keeps a small remainder (it is still going), so the estimate holds rather than
 * dropping to nothing and jumping back. While pages are drawn, the pages still to draw keep at least
 * their waves of PAGE_CONCURRENCY (the running wave counted half done), and a page being drawn
 * again after a refusal keeps most of a page's time.
 */
function currentStepLeft(state: GenerationState, framesDone: number, elapsed: number, t: StepTimings): number {
  const full = stepSeconds(state.step, state, t);
  if (state.step !== "pages") return Math.max(full - elapsed, Math.min(5, full * 0.25));
  const perPage = t.page + t.pageMask;
  const left = Math.max(framesOf(state) - framesDone, 0);
  if (!left) return 0;
  const byTime = full - elapsed;
  const byCount = (waves(state, left) - 0.5) * perPage;
  const redraw = state.redrawing.length ? perPage * 0.75 : 0;
  return Math.max(byTime, byCount, redraw, Math.min(5, perPage * 0.25));
}

/**
 * About how many seconds are left: the rest of the running step plus every step still to come at
 * its typical length (pages in waves of PAGE_CONCURRENCY). Not a countdown: it is an estimate from
 * typical durations, and it only goes down while things run as usual.
 */
export function remainingSeconds(state: GenerationState, framesDone: number, t: StepTimings, now: number): number {
  const steps = stepsFor(state);
  const at = steps.indexOf(state.step);
  const began = Date.parse(state.stepAt);
  const elapsed = Number.isNaN(began) ? 0 : Math.max((now - began) / 1000, 0);
  let left = currentStepLeft(state, framesDone, elapsed, t);
  for (const step of steps.slice(at + 1)) left += stepSeconds(step, state, t);
  return left;
}

/** Rounded up to 5 seconds, so a poll that finds nothing changed gets the same answer. */
export function roundEta(seconds: number): number {
  return Math.max(0, Math.ceil(seconds / 5) * 5);
}

/**
 * What the screen keeps showing between polls: a lower estimate at once, a slightly higher one is
 * ignored (it would make the time left wobble back up), a much higher one is real news (a page
 * being drawn again) and is shown.
 */
export function steadyEta(shown: number | null, next: number | null, slack = 20): number | null {
  if (next === null || shown === null) return next;
  if (next <= shown || next - shown > slack) return next;
  return shown;
}

/** How the time left reads: "soon", under a minute, or about so many minutes. */
export type EtaPhrase = { kind: "soon" } | { kind: "underMinute" } | { kind: "minutes"; minutes: number };

export function etaPhrase(seconds: number): EtaPhrase {
  if (seconds <= 10) return { kind: "soon" };
  if (seconds < 50) return { kind: "underMinute" };
  return { kind: "minutes", minutes: Math.max(1, Math.round(seconds / 60)) };
}

/** A generation state for a book that has none (made before it was kept): read off its status. */
export function stateOfStatus(
  status: BookStatus,
  book: { toy: boolean; pet: boolean; pages: number; since: string },
): GenerationState {
  return {
    step: stepOfStatus(status),
    toy: book.toy,
    pet: book.pet,
    pages: book.pages,
    cast: 0,
    drawing: [],
    redrawing: [],
    startedAt: status === "queued" ? null : book.since,
    stepAt: book.since,
  };
}

/** The view of a book being made, from its state, what is drawn so far and typical timings. */
export function generationView(
  state: GenerationState,
  progress: { pagesDone: number; framesDone?: number; petImageUrl: string | null },
  timings: StepTimings,
  now: number,
): GenerationView {
  const steps = stepsFor(state);
  const step = steps.includes(state.step) ? state.step : steps[0];
  const fixed = { ...state, step };
  const framesTotal = framesOf(state);
  const framesDone = Math.min(progress.framesDone ?? progress.pagesDone, framesTotal);
  return {
    steps: stepStates(steps, step),
    step,
    toy: state.toy,
    pet: state.pet,
    pagesDone: Math.min(progress.pagesDone, state.pages),
    pagesTotal: state.pages,
    framesDone,
    framesTotal,
    drawing: state.drawing,
    redrawing: state.redrawing,
    petImageUrl: progress.petImageUrl,
    etaSeconds: roundEta(remainingSeconds(fixed, framesDone, timings, now)),
  };
}
