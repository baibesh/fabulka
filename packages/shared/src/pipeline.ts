import { z } from "zod";
import type { ModelCallKind } from "./index";
import { pipelineFor, PIPELINE_STEP_IDS, PipelineStepIdSchema, type PipelineStep, type PipelineStepId, type StoryFormatData } from "./formats";

// ---- The pipeline as a graph ---------------------------------------------------------------------
//
// The admin's Pipeline page draws what a book in a format goes through: every step of pipelineFor()
// plus what happens around it (the wizard's voice input, the child's photo deleted after the hero
// sheet, the PDF at the end). The graph's shape is fixed by the format engine; only the format's
// parameters are edited. Each ModelCall row is found on it by its step (or, for rows made before
// steps were kept, by its kind): graphNodeOf().

/** What a node calls: Meta's models, Chromium for render QA, or nothing (Fabulka's own work). */
export const PIPELINE_MODELS = ["muse-spark", "muse-image", "sam", "muse-voice", "chromium", "fabulka"] as const;
export type PipelineModel = (typeof PIPELINE_MODELS)[number];

/** Graph nodes that are not pipeline steps: the wizard's voice input, the photo's deletion, the PDF. */
export const EXTRA_NODE_IDS = ["voice.transcribe", "voice.extract", "photo.delete", "book.pdf"] as const;
export const GRAPH_NODE_IDS = [...EXTRA_NODE_IDS.slice(0, 2), ...PIPELINE_STEP_IDS, ...EXTRA_NODE_IDS.slice(2)] as const;
export const GraphNodeIdSchema = z.enum(GRAPH_NODE_IDS);
export type GraphNodeId = z.infer<typeof GraphNodeIdSchema>;

/** The column a node sits in, left to right: what it is part of. */
export const PIPELINE_STAGES = ["wizard", "inputs", "story", "sheets", "pictures", "layout", "after"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** For which books a node runs: every book, or only some (the condition). */
export const NODE_CONDITIONS = ["always", "voice", "toy", "photo", "pet", "cast", "refusal", "overflow", "translation"] as const;
export type NodeCondition = (typeof NODE_CONDITIONS)[number];

export interface PipelineGraphNode {
  id: GraphNodeId;
  /** The pipeline step it is, when it is one (its ModelCall rows carry it). */
  step: PipelineStepId | null;
  model: PipelineModel;
  /** What one run is for; "wizard" for the voice input before a book exists. */
  per: PipelineStep["per"] | "wizard";
  stage: PipelineStage;
  /** Runs only for some books; `when` says which. */
  optional: boolean;
  when: NodeCondition;
  /** The format's settings it uses, as they stand (pipelineFor's). */
  params: Record<string, unknown>;
}

/**
 * - data: a step takes another's output.
 * - chain: Muse Image's previous_response_id, so a picture keeps the sheet's characters (sheet -> frames).
 * - photo: where the child's photo goes (sent once, then deleted).
 * - retry: a loop back (a refused frame drawn again from a rewritten scene, a shortened text laid out again).
 */
export const GRAPH_EDGE_KINDS = ["data", "chain", "photo", "retry"] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

export interface PipelineGraphEdge {
  id: string;
  source: GraphNodeId;
  target: GraphNodeId;
  kind: GraphEdgeKind;
}

export interface PipelineGraph {
  nodes: PipelineGraphNode[];
  edges: PipelineGraphEdge[];
}

const STAGE_OF: Record<GraphNodeId, PipelineStage> = {
  "voice.transcribe": "wizard",
  "voice.extract": "wizard",
  "toy.cutout": "inputs",
  "toy.describe": "inputs",
  "hero.describe": "inputs",
  "story.write": "story",
  "story.review": "story",
  "sheet.hero": "sheets",
  "photo.delete": "sheets",
  "sheet.pet": "sheets",
  "sheet.toy": "sheets",
  "sheet.cast": "sheets",
  "frame.draw": "pictures",
  "frame.rewrite": "pictures",
  "frame.mask": "pictures",
  "cover.draw": "pictures",
  "cover.mask": "pictures",
  "layout.check": "layout",
  "text.shorten": "layout",
  "book.pdf": "layout",
  "story.translate": "after",
};

const WHEN_OF: Partial<Record<GraphNodeId, NodeCondition>> = {
  "voice.transcribe": "voice",
  "voice.extract": "voice",
  "toy.cutout": "toy",
  "toy.describe": "toy",
  "sheet.toy": "toy",
  "hero.describe": "photo",
  "photo.delete": "photo",
  "sheet.pet": "pet",
  "sheet.cast": "cast",
  "frame.rewrite": "refusal",
  "text.shorten": "overflow",
  "story.translate": "translation",
};

/**
 * The graph of a book in this format: pipelineFor's steps with their `after` as edges (Muse Image
 * after Muse Image is the previous_response_id chain), the wizard's voice input feeding the story,
 * the photo path (described by Muse Spark, drawn from by Muse Image, then deleted), the two retry
 * loops and the PDF.
 */
export function pipelineGraph(format: StoryFormatData): PipelineGraph {
  const steps = pipelineFor(format);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const node = (step: PipelineStep): PipelineGraphNode => ({
    id: step.id,
    step: step.id,
    model: step.model,
    per: step.per,
    stage: STAGE_OF[step.id],
    optional: step.optional,
    when: step.optional ? (WHEN_OF[step.id] ?? "always") : "always",
    params: step.params,
  });
  const extra = (id: (typeof EXTRA_NODE_IDS)[number], model: PipelineModel, per: PipelineGraphNode["per"], optional: boolean): PipelineGraphNode => ({
    id,
    step: null,
    model,
    per,
    stage: STAGE_OF[id],
    optional,
    when: optional ? (WHEN_OF[id] ?? "always") : "always",
    params: {},
  });
  const nodes: PipelineGraphNode[] = [
    extra("voice.transcribe", "muse-voice", "wizard", true),
    extra("voice.extract", "muse-spark", "wizard", true),
    ...steps.map(node),
    extra("photo.delete", "fabulka", "book", true),
    extra("book.pdf", "chromium", "book", false),
  ];

  const edges: PipelineGraphEdge[] = [];
  const add = (source: GraphNodeId, target: GraphNodeId, kind: GraphEdgeKind) => edges.push({ id: `${source}->${target}:${kind}`, source, target, kind });
  add("voice.transcribe", "voice.extract", "data");
  add("voice.extract", "story.write", "data");
  for (const step of steps) {
    for (const from of step.after) {
      const source = byId.get(from);
      if (!source) continue;
      add(from, step.id, source.model === "muse-image" && step.model === "muse-image" ? "chain" : "data");
    }
  }
  add("hero.describe", "sheet.hero", "photo");
  add("sheet.hero", "photo.delete", "photo");
  add("frame.rewrite", "frame.draw", "retry");
  add("text.shorten", "layout.check", "retry");
  add("layout.check", "book.pdf", "data");
  return { nodes, edges };
}

/** Old journal rows (made before steps were kept) found on the graph by their kind. */
const NODE_OF_KIND: Partial<Record<ModelCallKind, GraphNodeId>> = {
  "voice-transcribe": "voice.transcribe",
  "voice-extract": "voice.extract",
  "photo-delete": "photo.delete",
  "toy-cutout": "toy.cutout",
  "toy-describe": "toy.describe",
  "hero-describe": "hero.describe",
  story: "story.write",
  review: "story.review",
  hero: "sheet.hero",
  pet: "sheet.pet",
  "toy-sheet": "sheet.toy",
  cast: "sheet.cast",
  page: "frame.draw",
  "scene-rewrite": "frame.rewrite",
  "page-mask": "frame.mask",
  cover: "cover.draw",
  "cover-mask": "cover.mask",
  render: "layout.check",
  shorten: "text.shorten",
  translate: "story.translate",
};

/**
 * The node a journal row belongs to: the photo's deletion and the voice input by their kind, else
 * the row's step, else (an older row) its kind. Null for calls outside the pipeline (theme proposals).
 */
export function graphNodeOf(row: { step: string | null; kind: string }): GraphNodeId | null {
  if (row.kind === "photo-delete" || row.kind === "voice-transcribe" || row.kind === "voice-extract") return NODE_OF_KIND[row.kind] ?? null;
  const step = PipelineStepIdSchema.safeParse(row.step);
  if (step.success) return step.data;
  return NODE_OF_KIND[row.kind as keyof typeof NODE_OF_KIND] ?? null;
}

// ---- Live stats on the graph ---------------------------------------------------------------------

export const PIPELINE_PERIODS = ["7d", "30d"] as const;
export const PipelinePeriodSchema = z.enum(PIPELINE_PERIODS);
export type PipelinePeriod = z.infer<typeof PipelinePeriodSchema>;

/** Query of GET /admin/pipeline/stats. */
export const PipelineStatsQuerySchema = z.object({
  format: z.string().trim().min(1).max(60),
  period: PipelinePeriodSchema.default("7d"),
});

/** One node's calls in the period, for books of the format (the voice input: every book's). */
export const NodeStatsSchema = z.object({
  calls: z.number().int(),
  /** Books the calls were for (none for the voice input). */
  books: z.number().int(),
  errors: z.number().int(),
  /** Errors that were the safety filter's refusals (content_policy). */
  refusals: z.number().int(),
  costUsd: z.number(),
  avgCostUsd: z.number(),
  avgLatencyMs: z.number().nullable(),
  /** errors / calls, 0..1. */
  errorRate: z.number(),
});
export type NodeStats = z.infer<typeof NodeStatsSchema>;

export const PipelineStatsSchema = z.object({
  format: z.string(),
  period: PipelinePeriodSchema,
  /** Books of the format made in the period. */
  books: z.number().int(),
  costUsd: z.number(),
  nodes: z.partialRecord(GraphNodeIdSchema, NodeStatsSchema),
  /** Illustrator references by kind (REFERENCE_KINDS): how many are on, of how many; sheets, frames and the cover take them. */
  references: z.array(z.object({ kind: z.string(), enabled: z.number().int(), total: z.number().int() })),
});
export type PipelineStats = z.infer<typeof PipelineStatsSchema>;

/** A row of the stats query: the journal grouped by step and kind. */
export interface StatsRow {
  step: string | null;
  kind: string;
  calls: number;
  books: number;
  errors: number;
  refusals: number;
  cost: number;
  latency: number;
}

/** Sums the grouped rows onto the graph's nodes; rows outside the pipeline are left out. */
export function nodeStats(rows: readonly StatsRow[]): Partial<Record<GraphNodeId, NodeStats>> {
  const sums = new Map<GraphNodeId, Omit<StatsRow, "step" | "kind">>();
  for (const row of rows) {
    const id = graphNodeOf(row);
    if (!id) continue;
    const s = sums.get(id) ?? { calls: 0, books: 0, errors: 0, refusals: 0, cost: 0, latency: 0 };
    s.calls += row.calls;
    // A book whose calls are split over kinds (old rows and new) is counted once a kind: an upper bound.
    s.books = Math.max(s.books, row.books);
    s.errors += row.errors;
    s.refusals += row.refusals;
    s.cost += row.cost;
    s.latency += row.latency;
    sums.set(id, s);
  }
  const out: Partial<Record<GraphNodeId, NodeStats>> = {};
  for (const [id, s] of sums) {
    out[id] = {
      calls: s.calls,
      books: s.books,
      errors: s.errors,
      refusals: s.refusals,
      costUsd: s.cost,
      avgCostUsd: s.calls ? s.cost / s.calls : 0,
      avgLatencyMs: s.calls ? Math.round(s.latency / s.calls) : null,
      errorRate: s.calls ? s.errors / s.calls : 0,
    };
  }
  return out;
}

// ---- One book's run on the graph -----------------------------------------------------------------

/** Characters of a prompt or output the trace shows. */
export const TRACE_TEXT_LIMIT = 400;

export const TraceCallSchema = z.object({
  id: z.string(),
  node: GraphNodeIdSchema,
  /** MODEL_CALL_KINDS (a string here: this module loads before index defines them). */
  kind: z.string(),
  model: z.string(),
  status: z.enum(["ok", "error"]),
  errorCode: z.string().nullable(),
  attempt: z.number().int(),
  page: z.number().int().nullable(),
  frame: z.number().int().nullable(),
  latencyMs: z.number().int(),
  costUsd: z.number(),
  /** When the call was sent (its end less its latency) and when it ended. */
  startedAt: z.string(),
  endedAt: z.string(),
  /** Only failed calls keep their texts (30 days); cut to TRACE_TEXT_LIMIT. */
  prompt: z.string().nullable(),
  output: z.string().nullable(),
});
export type TraceCall = z.infer<typeof TraceCallSchema>;

export const ART_OUTCOMES = ["drawn", "softened", "rewritten", "refused"] as const;

/** One frame of the book: its picture, the scene it was drawn from, its calls and the refusal ladder taken. */
export const TraceFrameSchema = z.object({
  page: z.number().int(),
  frame: z.number().int(),
  imageUrl: z.string().nullable(),
  /** The scene prompt Muse Spark wrote for it, cut to TRACE_TEXT_LIMIT. */
  scene: z.string(),
  /** How the picture came out: drawn at once, from the softened scene, the rewritten one, or refused. */
  art: z.enum(ART_OUTCOMES).nullable(),
  calls: z.number().int(),
  refusals: z.number().int(),
  costUsd: z.number(),
  latencyMs: z.number().int(),
});
export type TraceFrame = z.infer<typeof TraceFrameSchema>;

/** A node's share of the run. */
export const TraceNodeSchema = z.object({
  calls: z.number().int(),
  errors: z.number().int(),
  refusals: z.number().int(),
  costUsd: z.number(),
  /** Model time summed over its calls (frames run in parallel, so more than the wall time). */
  latencyMs: z.number().int(),
  firstAt: z.string(),
  lastAt: z.string(),
});
export type TraceNode = z.infer<typeof TraceNodeSchema>;

export const PipelineTraceSchema = z.object({
  book: z.object({
    id: z.string(),
    title: z.string().nullable(),
    childName: z.string(),
    format: z.string(),
    status: z.string(),
    language: z.string(),
    heroSource: z.string(),
    costUsd: z.number(),
    createdAt: z.string(),
  }),
  calls: z.array(TraceCallSchema),
  nodes: z.partialRecord(GraphNodeIdSchema, TraceNodeSchema),
  frames: z.array(TraceFrameSchema),
  /** Pictures of the book's nodes: the sheets and the cover. */
  images: z.partialRecord(GraphNodeIdSchema, z.array(z.object({ label: z.string(), url: z.string() }))),
});
export type PipelineTrace = z.infer<typeof PipelineTraceSchema>;

/** A book the trace may open (GET /admin/pipeline/books?q=). */
export const TraceBookSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  childName: z.string(),
  format: z.string(),
  status: z.string(),
  calls: z.number().int(),
  createdAt: z.string(),
});
export type TraceBook = z.infer<typeof TraceBookSchema>;

const cut = (text: string | null, limit = TRACE_TEXT_LIMIT) => (text === null ? null : text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

/** What the trace needs of a journal row. */
export interface TraceRow {
  id: string;
  step: string | null;
  kind: string;
  model: string;
  status: string;
  errorCode: string | null;
  attempt: number;
  page: number | null;
  frame: number | null;
  latencyMs: number;
  costUsd: number;
  prompt: string | null;
  output: string | null;
  createdAt: Date;
}

/** What the trace needs of a stored frame. */
export interface TraceFrameSource {
  page: number;
  frame: number;
  imageUrl: string | null;
  scene: string;
  art: (typeof ART_OUTCOMES)[number] | null;
}

/**
 * A book's run from its journal rows (in any order) and its stored frames: the calls in the order
 * they were sent, each node's share, and every frame's calls and refusals. Rows outside the
 * pipeline are left out. A row is written when its call ends, so it was sent latencyMs before.
 */
export function buildTrace(rows: readonly TraceRow[], frames: readonly TraceFrameSource[]): Pick<PipelineTrace, "calls" | "nodes" | "frames"> {
  const calls: TraceCall[] = [];
  for (const row of rows) {
    const node = graphNodeOf(row);
    if (!node) continue;
    const ended = row.createdAt.getTime();
    calls.push({
      id: row.id,
      node,
      kind: row.kind,
      model: row.model,
      status: row.status === "error" ? "error" : "ok",
      errorCode: row.errorCode,
      attempt: row.attempt,
      page: row.page,
      frame: row.frame,
      latencyMs: row.latencyMs,
      costUsd: row.costUsd,
      startedAt: new Date(ended - row.latencyMs).toISOString(),
      endedAt: row.createdAt.toISOString(),
      prompt: cut(row.prompt),
      output: cut(row.output),
    });
  }
  calls.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id));

  const nodes: Partial<Record<GraphNodeId, TraceNode>> = {};
  for (const call of calls) {
    const refused = call.errorCode === "content_policy";
    const n = nodes[call.node];
    if (!n) {
      nodes[call.node] = {
        calls: 1,
        errors: call.status === "error" ? 1 : 0,
        refusals: refused ? 1 : 0,
        costUsd: call.costUsd,
        latencyMs: call.latencyMs,
        firstAt: call.startedAt,
        lastAt: call.endedAt,
      };
      continue;
    }
    n.calls += 1;
    if (call.status === "error") n.errors += 1;
    if (refused) n.refusals += 1;
    n.costUsd += call.costUsd;
    n.latencyMs += call.latencyMs;
    if (call.endedAt > n.lastAt) n.lastAt = call.endedAt;
  }

  const traced: TraceFrame[] = frames.map((f) => {
    const mine = calls.filter((c) => c.page === f.page && (c.frame ?? 1) === f.frame && c.node.startsWith("frame."));
    return {
      page: f.page,
      frame: f.frame,
      imageUrl: f.imageUrl,
      scene: cut(f.scene) ?? "",
      art: f.art,
      calls: mine.length,
      refusals: mine.filter((c) => c.errorCode === "content_policy").length,
      costUsd: mine.reduce((sum, c) => sum + c.costUsd, 0),
      latencyMs: mine.reduce((sum, c) => sum + c.latencyMs, 0),
    };
  });
  return { calls, nodes, frames: traced };
}
