/**
 * Where the pipeline graph's nodes go, without React: "stages" puts each stage in a column (a side
 * step such as the photo's deletion or a scene rewrite beside the step it hangs off), "flow" is
 * dagre's left-to-right layout of the whole graph. Both pick each edge's handles so lines enter and
 * leave nodes on the right sides. Unit-tested.
 */
import dagre from "@dagrejs/dagre";
import { PIPELINE_STAGES, type GraphNodeId, type PipelineGraph, type PipelineGraphEdge, type PipelineStage } from "@fabulka/shared";

export const NODE_W = 232;
export const NODE_H = 118;
const COL_GAP = 96;
const ROW_GAP = 40;
const SIDE_GAP = 56;
const STAGE_PAD = 20;
const STAGE_HEAD = 34;

export type LayoutMode = "stages" | "flow";

/** Handle ids on the node card: targets l, t, bt; sources r, b, ls. */
export type SourceHandle = "r" | "b" | "ls";
export type TargetHandle = "l" | "t" | "bt";

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

/** Side steps drawn beside the step they hang off, in the stages layout. */
export const SIDE_OF: Partial<Record<GraphNodeId, GraphNodeId>> = {
  "photo.delete": "sheet.hero",
  "frame.rewrite": "frame.draw",
  "text.shorten": "layout.check",
};

export function layoutGraph(graph: PipelineGraph, mode: LayoutMode): GraphLayout {
  return mode === "flow" ? flowLayout(graph) : stagesLayout(graph);
}

function stagesLayout(graph: PipelineGraph): GraphLayout {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const columns = PIPELINE_STAGES.map((stage) => ({
    stage,
    rows: graph.nodes.filter((n) => n.stage === stage && !(SIDE_OF[n.id] && ids.has(SIDE_OF[n.id]!))).map((n) => n.id),
  })).filter((c) => c.rows.length > 0);
  const sideOf = (anchor: GraphNodeId) => (Object.keys(SIDE_OF) as GraphNodeId[]).find((id) => SIDE_OF[id] === anchor && ids.has(id));

  const heights = columns.map((c) => c.rows.length * NODE_H + (c.rows.length - 1) * ROW_GAP);
  const tallest = Math.max(...heights);
  const positions: GraphLayout["positions"] = {};
  const stages: StageBox[] = [];
  const where = new Map<GraphNodeId, { col: number; row: number; side: boolean }>();
  let x = 0;
  columns.forEach((column, col) => {
    const wide = column.rows.some((id) => sideOf(id));
    const width = wide ? NODE_W * 2 + SIDE_GAP : NODE_W;
    const top = (tallest - heights[col]) / 2;
    column.rows.forEach((id, row) => {
      const y = top + row * (NODE_H + ROW_GAP);
      positions[id] = { x, y };
      where.set(id, { col, row, side: false });
      const side = sideOf(id);
      if (side) {
        positions[side] = { x: x + NODE_W + SIDE_GAP, y };
        where.set(side, { col, row, side: true });
      }
    });
    stages.push({ stage: column.stage, x: x - STAGE_PAD, y: top - STAGE_PAD - STAGE_HEAD, w: width + 2 * STAGE_PAD, h: heights[col] + 2 * STAGE_PAD + STAGE_HEAD });
    x += width + COL_GAP;
  });

  const edges = graph.edges
    .filter((e) => where.has(e.source) && where.has(e.target))
    .map((e): RoutedEdge => {
      const s = where.get(e.source)!;
      const t = where.get(e.target)!;
      // A side step goes back to its anchor under both cards.
      if (e.kind === "retry") return { ...e, sourceHandle: "b", targetHandle: "bt" };
      if (s.col === t.col && !s.side && !t.side) {
        // Next one down: straight down; further down: around the column's left side.
        return t.row === s.row + 1 ? { ...e, sourceHandle: "b", targetHandle: "t" } : { ...e, sourceHandle: "ls", targetHandle: "l" };
      }
      return { ...e, sourceHandle: "r", targetHandle: "l" };
    });
  return { positions, edges, stages };
}

function flowLayout(graph: PipelineGraph): GraphLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 90, marginx: 0, marginy: 0 });
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
