/**
 * Where the pipeline graph's nodes go, without React. "stages" reads left to right in five columns
 * (the form and the inputs, the story, the sheets, the pictures, layout and after), each stage in a
 * frame of its own, so the whole pipeline fits a screen; "flow" is dagre's left-to-right layout of
 * the whole graph. Both pick each edge's handles so lines enter and leave cards on sensible sides.
 * Unit-tested.
 */
import dagre from "@dagrejs/dagre";
import type { GraphNodeId, PipelineGraph, PipelineGraphEdge, PipelineStage } from "@fabulka/shared";

export const NODE_W = 232;
export const NODE_H = 116;
const COL_GAP = 104;
const ROW_GAP = 30;
const STAGE_PAD = 18;
const STAGE_HEAD = 30;
/** Between two stage frames in one column. */
const STAGE_GAP = 28;

export type LayoutMode = "stages" | "flow";

/** Handle ids on the node card: targets l, t, bt, rt; sources r, b, ls. */
export type SourceHandle = "r" | "b" | "ls";
export type TargetHandle = "l" | "t" | "bt" | "rt";

export interface RoutedEdge extends PipelineGraphEdge {
  sourceHandle: SourceHandle;
  targetHandle: TargetHandle;
}

export interface StageBox {
  stage: PipelineStage;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphLayout {
  /** Each node's top-left corner. */
  positions: Partial<Record<GraphNodeId, { x: number; y: number }>>;
  edges: RoutedEdge[];
  stages: StageBox[];
}

/** The stages layout's columns, and the order of the cards in each stage (top to bottom). */
const COLUMNS: { stage: PipelineStage; rows: GraphNodeId[] }[][] = [
  [
    { stage: "wizard", rows: ["voice.transcribe", "voice.extract"] },
    { stage: "inputs", rows: ["toy.cutout", "toy.describe", "hero.describe"] },
  ],
  [{ stage: "story", rows: ["story.write", "story.review"] }],
  [{ stage: "sheets", rows: ["sheet.hero", "sheet.pet", "sheet.toy", "sheet.cast", "photo.delete"] }],
  [{ stage: "pictures", rows: ["frame.draw", "frame.rewrite", "frame.mask", "cover.draw", "cover.mask"] }],
  [
    { stage: "layout", rows: ["layout.check", "text.shorten", "book.pdf"] },
    { stage: "after", rows: ["story.translate"] },
  ],
];

export function layoutGraph(graph: PipelineGraph, mode: LayoutMode): GraphLayout {
  return mode === "flow" ? flowLayout(graph) : stagesLayout(graph);
}

function stagesLayout(graph: PipelineGraph): GraphLayout {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const placed = new Set(COLUMNS.flat().flatMap((s) => s.rows));
  // A node no column names (a step added later) goes at the end of its stage.
  const columns = COLUMNS.map((column) =>
    column
      .map((s) => ({ stage: s.stage, rows: [...s.rows, ...graph.nodes.filter((n) => n.stage === s.stage && !placed.has(n.id)).map((n) => n.id)].filter((id) => ids.has(id)) }))
      .filter((s) => s.rows.length > 0),
  ).filter((column) => column.length > 0);

  const stageHeight = (rows: number) => rows * NODE_H + (rows - 1) * ROW_GAP + 2 * STAGE_PAD + STAGE_HEAD;
  const columnHeight = (column: (typeof columns)[number]) => column.reduce((h, s) => h + stageHeight(s.rows.length), 0) + (column.length - 1) * STAGE_GAP;
  const tallest = Math.max(...columns.map(columnHeight));

  const positions: GraphLayout["positions"] = {};
  const stages: StageBox[] = [];
  /** Each node's column and its place in the column, counting down across the column's stages. */
  const where = new Map<GraphNodeId, { col: number; row: number }>();
  columns.forEach((column, col) => {
    const x = col * (NODE_W + COL_GAP);
    let y = (tallest - columnHeight(column)) / 2;
    let row = 0;
    for (const stage of column) {
      const h = stageHeight(stage.rows.length);
      stages.push({ stage: stage.stage, x: x - STAGE_PAD, y, w: NODE_W + 2 * STAGE_PAD, h });
      stage.rows.forEach((id, i) => {
        positions[id] = { x, y: y + STAGE_PAD + STAGE_HEAD + i * (NODE_H + ROW_GAP) };
        where.set(id, { col, row: row++ });
      });
      y += h + STAGE_GAP;
    }
  });

  const edges = graph.edges
    .filter((e) => where.has(e.source) && where.has(e.target))
    .map((e): RoutedEdge => {
      const s = where.get(e.source)!;
      const t = where.get(e.target)!;
      if (s.col !== t.col) return { ...e, sourceHandle: "r", targetHandle: "l" };
      // In one column: the next card down straight down; a loop back around the right side; a card
      // further down around the left side.
      if (e.kind === "retry") return { ...e, sourceHandle: "r", targetHandle: "rt" };
      if (t.row === s.row + 1) return { ...e, sourceHandle: "b", targetHandle: "t" };
      return { ...e, sourceHandle: "ls", targetHandle: "l" };
    });
  return { positions, edges, stages };
}

function flowLayout(graph: PipelineGraph): GraphLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 80, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  // Loops back are drawn, not laid out: they would turn the flow around.
  for (const edge of graph.edges) if (edge.kind !== "retry") g.setEdge(edge.source, edge.target);
  dagre.layout(g);
  const positions: GraphLayout["positions"] = {};
  for (const node of graph.nodes) {
    const placed = g.node(node.id);
    positions[node.id] = { x: Math.round(placed.x - NODE_W / 2), y: Math.round(placed.y - NODE_H / 2) };
  }
  const edges = graph.edges.map((e): RoutedEdge => (e.kind === "retry" ? { ...e, sourceHandle: "b", targetHandle: "bt" } : { ...e, sourceHandle: "r", targetHandle: "l" }));
  return { positions, edges, stages: [] };
}
