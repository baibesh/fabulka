import { describe, expect, it } from "vitest";
import {
  BookSchema,
  PAGE_CONCURRENCY,
  TYPICAL_SECONDS,
  etaPhrase,
  generationView,
  remainingSeconds,
  roundEta,
  stateOfStatus,
  statusOfStep,
  steadyEta,
  stepSeconds,
  stepStates,
  stepsFor,
  type GenerationState,
  type GenerationStep,
} from "./index";

const T0 = Date.parse("2026-11-03T12:00:00Z");
const at = (seconds: number) => T0 + seconds * 1000;

function state(patch: Partial<GenerationState> = {}): GenerationState {
  return {
    step: "story",
    toy: false,
    pet: false,
    pages: 10,
    drawing: [],
    redrawing: [],
    startedAt: new Date(T0).toISOString(),
    stepAt: new Date(T0).toISOString(),
    ...patch,
  };
}

describe("stepsFor", () => {
  it("a plain book: no toy, no friends", () => {
    expect(stepsFor({ toy: false, pet: false })).toEqual(["read", "story", "review", "hero", "pages", "check", "pdf"]);
  });

  it("a pet adds the friends' sheets", () => {
    expect(stepsFor({ toy: false, pet: true })).toEqual(["read", "story", "review", "hero", "friends", "pages", "check", "pdf"]);
  });

  it("a toy photo adds the cut-out first and its sheet", () => {
    expect(stepsFor({ toy: true, pet: false })).toEqual(["read", "toy", "story", "review", "hero", "friends", "pages", "check", "pdf"]);
    expect(stepsFor({ toy: true, pet: true })).toHaveLength(9);
  });
});

describe("stepStates", () => {
  it("marks the steps before the current one done and the rest next", () => {
    const steps: GenerationStep[] = ["read", "story", "review", "hero"];
    expect(stepStates(steps, "review").map((s) => s.state)).toEqual(["done", "done", "current", "next"]);
  });
});

describe("status and step", () => {
  it("review and friends keep the coarse status of their stage", () => {
    expect(statusOfStep("review")).toBe("story");
    expect(statusOfStep("friends")).toBe("hero");
    expect(statusOfStep("check")).toBe("pdf");
    expect(statusOfStep("read")).toBe("queued");
  });

  it("a book without a state is read off its status", () => {
    const s = stateOfStatus("pages", { toy: true, pet: false, pages: 4, since: "2026-11-03T12:00:00.000Z" });
    expect(s.step).toBe("pages");
    expect(stepsFor(s)).toContain("toy");
    expect(stateOfStatus("queued", { toy: false, pet: false, pages: 10, since: "x" }).startedAt).toBeNull();
  });
});

describe("stepSeconds", () => {
  it("pages are drawn in waves of PAGE_CONCURRENCY", () => {
    const per = TYPICAL_SECONDS.page + TYPICAL_SECONDS.pageMask;
    expect(stepSeconds("pages", state({ pages: 10 }), TYPICAL_SECONDS)).toBe(Math.ceil(10 / PAGE_CONCURRENCY) * per);
    expect(stepSeconds("pages", state({ pages: 4 }), TYPICAL_SECONDS)).toBe(per);
  });

  it("friends cost the pet's and the toy's sheet only when there are some", () => {
    expect(stepSeconds("friends", state({ pet: true }), TYPICAL_SECONDS)).toBe(TYPICAL_SECONDS.pet);
    expect(stepSeconds("friends", state({ pet: true, toy: true }), TYPICAL_SECONDS)).toBe(TYPICAL_SECONDS.pet + TYPICAL_SECONDS.toySheet);
  });
});

describe("remainingSeconds", () => {
  it("a whole ten-page book with a pet takes about three and a half minutes", () => {
    const left = remainingSeconds(state({ step: "read", pet: true }), 0, TYPICAL_SECONDS, T0);
    expect(left).toBeGreaterThan(190);
    expect(left).toBeLessThan(230);
  });

  it("counts down while a step runs, and holds a little when it runs late", () => {
    const s = state({ step: "story" });
    const start = remainingSeconds(s, 0, TYPICAL_SECONDS, at(0));
    const later = remainingSeconds(s, 0, TYPICAL_SECONDS, at(20));
    const late = remainingSeconds(s, 0, TYPICAL_SECONDS, at(90));
    expect(start - later).toBeCloseTo(20);
    expect(late).toBeLessThan(later);
    expect(late).toBeGreaterThan(start - TYPICAL_SECONDS.story);
  });

  it("never goes up while pages are drawn as usual", () => {
    const s = state({ step: "pages", pages: 10 });
    let previous = Infinity;
    for (let second = 0; second <= 140; second += 2) {
      const done = Math.min(10, Math.floor(second / 36.5) * 4);
      const left = remainingSeconds(s, done, TYPICAL_SECONDS, at(second));
      expect(left).toBeLessThanOrEqual(previous + 1e-9);
      previous = left;
    }
  });

  it("pages left keep their waves even when time says otherwise", () => {
    const s = state({ step: "pages", pages: 10 });
    const per = TYPICAL_SECONDS.page + TYPICAL_SECONDS.pageMask;
    // Running late: two minutes in and only four pages done, six left = two waves.
    const left = remainingSeconds(s, 4, TYPICAL_SECONDS, at(120));
    expect(left).toBeGreaterThanOrEqual(1.5 * per);
  });

  it("a page drawn again keeps most of a page's time", () => {
    const per = TYPICAL_SECONDS.page + TYPICAL_SECONDS.pageMask;
    const plain = state({ step: "pages", pages: 4, drawing: [4] });
    const redrawing = state({ step: "pages", pages: 4, drawing: [4], redrawing: [4] });
    const after = (s: GenerationState) => remainingSeconds(s, 3, TYPICAL_SECONDS, at(40));
    expect(after(redrawing)).toBeGreaterThan(after(plain));
    expect(after(redrawing)).toBeGreaterThanOrEqual(0.75 * per);
  });

  it("the last steps are seconds", () => {
    expect(remainingSeconds(state({ step: "pdf" }), 10, TYPICAL_SECONDS, at(0))).toBeLessThan(2);
  });
});

describe("eta smoothing and words", () => {
  it("rounds up to five seconds", () => {
    expect(roundEta(0)).toBe(0);
    expect(roundEta(0.2)).toBe(5);
    expect(roundEta(121)).toBe(125);
  });

  it("takes a lower estimate, ignores a small rise, shows a big one", () => {
    expect(steadyEta(null, 120)).toBe(120);
    expect(steadyEta(120, 100)).toBe(100);
    expect(steadyEta(100, 110)).toBe(100);
    expect(steadyEta(100, 140)).toBe(140);
  });

  it("phrases", () => {
    expect(etaPhrase(5)).toEqual({ kind: "soon" });
    expect(etaPhrase(40)).toEqual({ kind: "underMinute" });
    expect(etaPhrase(130)).toEqual({ kind: "minutes", minutes: 2 });
    expect(etaPhrase(55)).toEqual({ kind: "minutes", minutes: 1 });
  });
});

describe("generationView", () => {
  it("is what the API sends while a book is made", () => {
    const view = generationView(
      state({ step: "pages", pet: true, pages: 4, drawing: [3, 4], redrawing: [4] }),
      { pagesDone: 2, petImageUrl: "/storage/books/b/pet.png" },
      TYPICAL_SECONDS,
      at(10),
    );
    expect(view.step).toBe("pages");
    expect(view.steps.find((s) => s.id === "friends")?.state).toBe("done");
    expect(view.steps.find((s) => s.id === "pages")?.state).toBe("current");
    expect(view.steps.find((s) => s.id === "check")?.state).toBe("next");
    expect(view).toMatchObject({ pagesDone: 2, pagesTotal: 4, drawing: [3, 4], redrawing: [4], petImageUrl: "/storage/books/b/pet.png" });
    expect(view.etaSeconds! % 5).toBe(0);
  });

  it("a step the book does not have falls back to the first", () => {
    const view = generationView(state({ step: "toy", toy: false }), { pagesDone: 0, petImageUrl: null }, TYPICAL_SECONDS, at(0));
    expect(view.step).toBe("read");
  });

  it("an answer without it (an older API) still parses", () => {
    const parsed = BookSchema.shape.generation.safeParse(undefined);
    expect(parsed.success).toBe(true);
  });
});
