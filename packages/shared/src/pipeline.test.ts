import { describe, expect, it } from "vitest";
import {
  COMIC,
  DEFAULT_STORY_FORMATS,
  GRAPH_NODE_IDS,
  PICTURE_BOOK,
  PIPELINE_STEP_IDS,
  buildTrace,
  graphNodeOf,
  nodeStats,
  pipelineFor,
  pipelineGraph,
  type StatsRow,
  type TraceRow,
} from "./index";

const format = (slug: string) => DEFAULT_STORY_FORMATS.find((f) => f.slug === slug)!;
const edge = (graph: ReturnType<typeof pipelineGraph>, source: string, target: string) => graph.edges.find((e) => e.source === source && e.target === target);

describe("pipelineGraph", () => {
  it("has a node for every pipeline step and the extras, each once", () => {
    const graph = pipelineGraph(format(PICTURE_BOOK));
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...GRAPH_NODE_IDS].sort());
    for (const step of PIPELINE_STEP_IDS) expect(graph.nodes.find((n) => n.id === step)?.step).toBe(step);
    expect(graph.nodes.find((n) => n.id === "photo.delete")).toMatchObject({ step: null, model: "fabulka", optional: true, when: "photo" });
    expect(graph.nodes.find((n) => n.id === "voice.transcribe")).toMatchObject({ model: "muse-voice", per: "wizard", stage: "wizard" });
  });

  it("draws every after[] of pipelineFor as an edge, and only between nodes it has", () => {
    const f = format(COMIC);
    const graph = pipelineGraph(f);
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const step of pipelineFor(f)) for (const from of step.after) expect(edge(graph, from, step.id)).toBeDefined();
    for (const e of graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
  });

  it("marks Muse Image after Muse Image as the previous_response_id chain, sheet to frames", () => {
    const graph = pipelineGraph(format(COMIC));
    expect(edge(graph, "sheet.hero", "sheet.pet")?.kind).toBe("chain");
    expect(edge(graph, "sheet.cast", "frame.draw")?.kind).toBe("chain");
    expect(edge(graph, "sheet.cast", "cover.draw")?.kind).toBe("chain");
    expect(edge(graph, "story.review", "sheet.hero")?.kind).toBe("data");
    expect(edge(graph, "frame.draw", "frame.mask")?.kind).toBe("data");
  });

  it("shows the photo path, the retry loops and the PDF", () => {
    const graph = pipelineGraph(format(PICTURE_BOOK));
    expect(edge(graph, "hero.describe", "sheet.hero")?.kind).toBe("photo");
    expect(edge(graph, "sheet.hero", "photo.delete")?.kind).toBe("photo");
    expect(edge(graph, "frame.rewrite", "frame.draw")?.kind).toBe("retry");
    expect(edge(graph, "text.shorten", "layout.check")?.kind).toBe("retry");
    expect(edge(graph, "layout.check", "book.pdf")?.kind).toBe("data");
    expect(edge(graph, "voice.extract", "story.write")?.kind).toBe("data");
  });

  it("carries the format's parameters on the nodes", () => {
    const comic = pipelineGraph(format(COMIC));
    const book = pipelineGraph(format(PICTURE_BOOK));
    const story = comic.nodes.find((n) => n.id === "story.write")!;
    expect(story.params.grids).toEqual(format(COMIC).grids.map((g) => g.id));
    expect(comic.nodes.find((n) => n.id === "frame.mask")!.params.concepts).toEqual(["person", "animal", "face"]);
    expect(book.nodes.find((n) => n.id === "frame.mask")!.params.concepts).toEqual(["person", "animal"]);
    // A picture book draws no cast sheets: the step is optional there, and always run in a comic.
    expect(book.nodes.find((n) => n.id === "sheet.cast")).toMatchObject({ optional: true, when: "cast" });
    expect(comic.nodes.find((n) => n.id === "sheet.cast")).toMatchObject({ optional: false, when: "always", params: { castSheets: 2 } });
  });
});

describe("graphNodeOf", () => {
  it("finds a row by its step, an older row by its kind, the extras by kind", () => {
    expect(graphNodeOf({ step: "frame.mask", kind: "page-mask" })).toBe("frame.mask");
    expect(graphNodeOf({ step: null, kind: "page" })).toBe("frame.draw");
    expect(graphNodeOf({ step: null, kind: "scene-rewrite" })).toBe("frame.rewrite");
    expect(graphNodeOf({ step: "sheet.hero", kind: "photo-delete" })).toBe("photo.delete");
    expect(graphNodeOf({ step: null, kind: "voice-transcribe" })).toBe("voice.transcribe");
    expect(graphNodeOf({ step: null, kind: "theme" })).toBeNull();
    expect(graphNodeOf({ step: "nonsense", kind: "ornament" })).toBeNull();
  });
});

describe("nodeStats", () => {
  const row = (over: Partial<StatsRow>): StatsRow => ({ step: null, kind: "story", calls: 1, books: 1, errors: 0, refusals: 0, cost: 0, latency: 0, ...over });

  it("sums rows onto nodes with averages and the error rate", () => {
    const stats = nodeStats([
      row({ step: "frame.draw", kind: "page", calls: 20, books: 2, errors: 2, refusals: 1, cost: 0.2, latency: 20 * 30000 }),
      row({ step: null, kind: "page", calls: 10, books: 1, cost: 0.1, latency: 10 * 33000 }),
      row({ step: null, kind: "theme", calls: 5 }),
    ]);
    expect(stats["frame.draw"]).toEqual({
      calls: 30,
      books: 2,
      errors: 2,
      refusals: 1,
      costUsd: expect.closeTo(0.3, 6),
      avgCostUsd: expect.closeTo(0.01, 6),
      avgLatencyMs: 31000,
      errorRate: expect.closeTo(2 / 30, 6),
    });
    expect(Object.keys(stats)).toEqual(["frame.draw"]);
  });

  it("gives nothing for no rows", () => {
    expect(nodeStats([])).toEqual({});
  });
});

describe("buildTrace", () => {
  const t0 = Date.parse("2026-11-04T10:00:00Z");
  const row = (over: Partial<TraceRow> & { at: number }): TraceRow => ({
    id: `c${over.at}`,
    step: null,
    kind: "story",
    model: "muse-spark-1.3",
    status: "ok",
    errorCode: null,
    attempt: 1,
    page: null,
    frame: null,
    latencyMs: 1000,
    costUsd: 0.01,
    prompt: null,
    output: null,
    createdAt: new Date(t0 + over.at),
    ...over,
  });

  it("orders calls by when they were sent and sums each node", () => {
    const { calls, nodes } = buildTrace(
      [
        // Ends later but was sent first: a long story call.
        row({ at: 30000, step: "story.write", latencyMs: 29000 }),
        row({ at: 5000, step: "toy.cutout", kind: "toy-cutout", latencyMs: 2000 }),
        row({ at: 40000, step: "frame.draw", kind: "page", page: 1, frame: 1, latencyMs: 4000, costUsd: 0.01 }),
        row({ at: 41000, step: "frame.draw", kind: "page", page: 1, frame: 2, latencyMs: 4000, costUsd: 0.01 }),
        row({ at: 50000, kind: "theme" }),
      ],
      [],
    );
    expect(calls.map((c) => c.node)).toEqual(["story.write", "toy.cutout", "frame.draw", "frame.draw"]);
    expect(calls[0].startedAt).toBe(new Date(t0 + 1000).toISOString());
    expect(nodes["frame.draw"]).toMatchObject({ calls: 2, costUsd: 0.02, latencyMs: 8000, firstAt: new Date(t0 + 36000).toISOString(), lastAt: new Date(t0 + 41000).toISOString() });
    expect(nodes["story.write"]?.calls).toBe(1);
  });

  it("breaks frames down with their refusal ladder and cuts long prompts", () => {
    const long = "x".repeat(1000);
    const { calls, frames, nodes } = buildTrace(
      [
        row({ at: 1000, step: "frame.draw", kind: "page", page: 2, frame: 1, status: "error", errorCode: "content_policy", costUsd: 0, prompt: long }),
        row({ at: 2000, step: "frame.draw", kind: "page", page: 2, frame: 1, status: "error", errorCode: "content_policy", costUsd: 0 }),
        row({ at: 3000, step: "frame.rewrite", kind: "scene-rewrite", page: 2, frame: 1, costUsd: 0.002 }),
        row({ at: 4000, step: "frame.draw", kind: "page", page: 2, frame: 1, costUsd: 0.01 }),
        row({ at: 5000, step: "frame.mask", kind: "page-mask", page: 2, frame: 1, costUsd: 0.0025 }),
        row({ at: 6000, step: "frame.draw", kind: "page", page: 3, frame: 1 }),
      ],
      [
        { page: 2, frame: 1, imageUrl: "/files/books/b/page-2.png", scene: long, art: "rewritten" },
        { page: 3, frame: 1, imageUrl: null, scene: "A park", art: "drawn" },
      ],
    );
    expect(calls[0].prompt).toHaveLength(400);
    expect(frames[0]).toMatchObject({ page: 2, frame: 1, art: "rewritten", calls: 5, refusals: 2, latencyMs: 5000 });
    expect(frames[0].costUsd).toBeCloseTo(0.0145, 6);
    expect(frames[0].scene).toHaveLength(400);
    expect(frames[1]).toMatchObject({ calls: 1, refusals: 0 });
    expect(nodes["frame.draw"]).toMatchObject({ calls: 4, errors: 2, refusals: 2 });
  });
});
