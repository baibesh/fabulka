"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphEdgeKind, GraphNodeId, NodeStats, PipelineGraph, PipelineGraphNode, PipelineStage, TraceNode } from "@fabulka/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { formatSpendUsd, useAdminI18n } from "../ui";
import { NODE_H, NODE_W, layoutGraph, type LayoutMode, type RoutedEdge } from "./layout";
import { MODEL_STYLE, type ReplayFrame } from "./replay";

/** What a card shows: the step, its model and either the period's numbers or the book's run. */
interface StepData extends Record<string, unknown> {
  node: PipelineGraphNode;
  stats?: NodeStats;
  /** Trace mode: the book's share of this node, and where the replay is. */
  trace?: { node?: TraceNode; replay?: ReplayFrame; tracing: boolean };
}
interface StageData extends Record<string, unknown> {
  stage: PipelineStage;
}
type StepNode = Node<StepData, "step">;
type StageNode = Node<StageData, "stage">;
interface PipeData extends Record<string, unknown> {
  kind: GraphEdgeKind;
  /** Trace mode: whether the line leads into a node running now, or between nodes this book never ran. */
  live?: boolean;
  faded?: boolean;
  label?: string;
}
type PipeEdge = Edge<PipeData, "pipe">;

/** Where each card's handles sit (see layout.ts for which edge uses which). */
const handle = (id: string, type: "source" | "target", position: Position, fx: number, fy: number) => ({ id, type, position, x: fx * NODE_W - 0.5, y: fy * NODE_H - 0.5, width: 1, height: 1 });
const HANDLES = [
  handle("l", "target", Position.Left, 0, 0.5),
  handle("t", "target", Position.Top, 0.5, 0),
  handle("bt", "target", Position.Bottom, 0.35, 1),
  handle("rt", "target", Position.Right, 1, 0.3),
  handle("r", "source", Position.Right, 1, 0.5),
  handle("b", "source", Position.Bottom, 0.65, 1),
  handle("ls", "source", Position.Left, 0, 0.7),
];

/** Room around the fitted graph in pixels; more at the bottom for the minimap and the replay bar. */
const FIT_PADDING = { top: 28, left: 28, right: 28, bottom: 112 };
/** Room on the right while the side panel is open. */
const PANEL_ROOM = 436;

/** The box the laid-out graph takes, stage frames included. */
function boundsOf(placed: ReturnType<typeof layoutGraph>) {
  const boxes = [...Object.values(placed.positions).map((p) => ({ x: p!.x, y: p!.y, w: NODE_W, h: NODE_H })), ...placed.stages];
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

const hidden = "!size-2 !min-w-0 !border-0 !bg-transparent";

function StepCard({ data, selected }: NodeProps<StepNode>) {
  const { t, number, ms, percent } = useAdminI18n();
  const { node, stats, trace } = data;
  const model = MODEL_STYLE[node.model];
  const replay = trace?.replay;
  const ran = trace?.node;
  const state = trace ? (trace.tracing ? (replay?.state ?? "idle") : ran ? "done" : "idle") : null;
  const skipped = trace && !ran;
  const calls = trace ? (trace.tracing ? (replay?.done ?? 0) : (ran?.calls ?? 0)) : null;
  return (
    <div
      data-testid={`pipeline-node-${node.id}`}
      data-state={state ?? undefined}
      style={{ width: NODE_W, height: NODE_H, ["--model" as string]: model.color }}
      className={cx(
        "pipeline-card group relative flex flex-col gap-1 overflow-hidden rounded-2xl border bg-card px-3.5 py-2.5 text-left shadow-sm transition-[opacity,box-shadow,border-color] duration-300",
        node.optional ? "border-dashed" : "border-solid",
        selected ? "border-[var(--model)] ring-2 ring-[var(--model)]/40" : "border-border hover:border-[var(--model)]/60",
        skipped && "opacity-35",
        state === "idle" && !skipped && trace?.tracing && "opacity-55",
        state === "active" && "pipeline-active border-[var(--model)]",
        replay?.refused && "pipeline-refused",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--model)]" />
      <Handle type="target" position={Position.Left} id="l" className={hidden} />
      <Handle type="target" position={Position.Top} id="t" className={hidden} />
      <Handle type="target" position={Position.Bottom} id="bt" className={hidden} style={{ left: "35%" }} />
      <Handle type="target" position={Position.Right} id="rt" className={hidden} style={{ top: "30%" }} />
      <Handle type="source" position={Position.Right} id="r" className={hidden} />
      <Handle type="source" position={Position.Bottom} id="b" className={hidden} style={{ left: "65%" }} />
      <Handle type="source" position={Position.Left} id="ls" className={hidden} style={{ top: "70%" }} />
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--model)]/12 px-2 py-0.5 text-[var(--model)]">
          <span className="size-1.5 rounded-full bg-[var(--model)]" />
          {model.name}
        </span>
        <span className="truncate font-semibold text-muted">{t(`admin.pipeline.per.${node.per}`)}</span>
      </div>
      <p className="truncate pb-0.5 text-[15px] leading-snug font-extrabold">{t(`admin.pipeline.node.${node.id}`)}</p>
      <div className="mt-auto">
        {trace ? (
          ran ? (
            <Figures
              cells={[
                { label: t("admin.pipeline.stat.calls"), value: `${calls}/${ran.calls}`, strong: true },
                { label: t("admin.pipeline.stat.cost"), value: formatSpendUsd(ran.costUsd) },
                { label: t("admin.pipeline.stat.latency"), value: ms(ran.latencyMs) },
                { label: t("admin.pipeline.stat.refusals"), value: String(ran.refusals), tone: ran.refusals ? "danger" : undefined },
              ]}
            />
          ) : (
            <p className="truncate text-[11px] text-muted">{t(`admin.pipeline.when.${node.when}`)}</p>
          )
        ) : stats ? (
          <Figures
            cells={[
              { label: t("admin.pipeline.stat.calls"), value: number(stats.calls), strong: true },
              { label: t("admin.pipeline.stat.avgCost"), value: formatSpendUsd(stats.avgCostUsd) },
              { label: t("admin.pipeline.stat.latency"), value: ms(stats.avgLatencyMs) },
              {
                label: t("admin.pipeline.stat.errors"),
                value: percent(stats.errorRate, stats.errorRate > 0 && stats.errorRate < 0.1 ? 1 : 0),
                tone: stats.errorRate >= 0.1 ? "danger" : stats.errors ? "warning" : undefined,
              },
            ]}
          />
        ) : (
          <p className="truncate text-[11px] text-muted">{node.optional ? t(`admin.pipeline.when.${node.when}`) : t("admin.pipeline.stat.none")}</p>
        )}
      </div>
    </div>
  );
}

/** A card's four numbers: each value over its small label. */
function Figures({ cells }: { cells: { label: string; value: string; strong?: boolean; tone?: "danger" | "warning" }[] }) {
  return (
    <dl className="grid grid-cols-4 gap-1.5 border-t border-border pt-1.5">
      {cells.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-col-reverse">
          <dt className="truncate text-[9.5px] text-muted">{c.label}</dt>
          <dd className={cx("truncate text-[12px] leading-tight font-bold tabular-nums", c.tone === "danger" ? "text-danger" : c.tone === "warning" ? "text-warning" : c.strong ? "text-foreground" : "text-foreground/80")}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StageFrame({ data, width, height }: NodeProps<StageNode>) {
  const { t } = useAdminI18n();
  return (
    <div style={{ width, height }} className="pointer-events-none rounded-[1.5rem] border border-border/70 bg-background/60">
      <p className="px-5 pt-3 text-[11px] font-bold tracking-widest text-muted uppercase">{t(`admin.pipeline.stage.${data.stage}`)}</p>
    </div>
  );
}

/** Edge colours: data lines are quiet, the chain carries Muse Image's colour, the photo path pink. */
const EDGE_STYLE: Record<GraphEdgeKind, { stroke: string; width: number; dash?: string }> = {
  data: { stroke: "var(--muted)", width: 1.5 },
  chain: { stroke: MODEL_STYLE["muse-image"].color, width: 3, dash: "8 6" },
  photo: { stroke: MODEL_STYLE["muse-voice"].color, width: 2, dash: "3 5" },
  retry: { stroke: "var(--warning)", width: 1.5, dash: "2 5" },
};

function Pipe(props: EdgeProps<PipeEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  const kind = data?.kind ?? "data";
  const looping = kind === "retry" || sourcePosition === Position.Left;
  const [path, labelX, labelY] = looping
    ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 26 })
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const style = EDGE_STYLE[kind];
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={cx((kind === "chain" || data?.live) && "pipeline-flow")}
        style={{
          stroke: data?.live ? "var(--accent)" : style.stroke,
          strokeWidth: data?.live ? style.width + 1 : style.width,
          strokeDasharray: data?.live ? "8 6" : style.dash,
          opacity: data?.faded ? 0.25 : kind === "data" ? 0.7 : 1,
          transition: "opacity 300ms, stroke 300ms",
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <span
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="nodrag nopan pointer-events-none absolute rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-semibold text-[color:var(--chain)] shadow-sm"
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { step: StepCard, stage: StageFrame };
const edgeTypes = { pipe: Pipe };

export interface GraphCanvasProps {
  graph: PipelineGraph;
  layout: LayoutMode;
  selected: GraphNodeId | null;
  onSelect: (id: GraphNodeId | null) => void;
  stats?: Partial<Record<GraphNodeId, NodeStats>>;
  /** Trace mode: the book's nodes and the replay (null when not playing). */
  trace?: { nodes: Partial<Record<GraphNodeId, TraceNode>>; replay: Partial<Record<GraphNodeId, ReplayFrame>> | null };
}

/** The pipeline graph on a Miro-like canvas: pan, zoom, minimap, fit to view. */
export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ graph, layout, selected, onSelect, stats, trace }: GraphCanvasProps) {
  const placed = useMemo(() => layoutGraph(graph, layout), [graph, layout]);
  const { setViewport } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const panelOpen = selected !== null;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Fit the graph to the canvas from the layout itself (no measuring): on load, on resize, when the
  // layout changes, and with the side panel open the graph moves left of it so no card hides under it.
  useEffect(() => {
    if (!size) return;
    const bounds = boundsOf(placed);
    const pad = { ...FIT_PADDING, right: panelOpen ? PANEL_ROOM : FIT_PADDING.right };
    const w = Math.max(100, size.w - pad.left - pad.right);
    const h = Math.max(100, size.h - pad.top - pad.bottom);
    const zoom = Math.min(w / bounds.w, h / bounds.h, 1.1);
    void setViewport(
      { x: pad.left + (w - bounds.w * zoom) / 2 - bounds.x * zoom, y: pad.top + (h - bounds.h * zoom) / 2 - bounds.y * zoom, zoom },
      { duration: 300 },
    );
  }, [size, placed, panelOpen, setViewport]);

  const nodes = useMemo<(StepNode | StageNode)[]>(() => {
    const stages: StageNode[] = placed.stages.map((s) => ({
      id: `stage-${s.stage}`,
      type: "stage",
      position: { x: s.x, y: s.y },
      width: s.w,
      height: s.h,
      data: { stage: s.stage },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    }));
    const steps: StepNode[] = graph.nodes.map((node) => ({
      id: node.id,
      type: "step",
      position: placed.positions[node.id] ?? { x: 0, y: 0 },
      width: NODE_W,
      height: NODE_H,
      // Handles are given, not measured: edges stay put while the replay redraws the cards.
      handles: HANDLES,
      selected: node.id === selected,
      data: {
        node,
        stats: stats?.[node.id],
        trace: trace ? { node: trace.nodes[node.id], replay: trace.replay?.[node.id], tracing: trace.replay !== null } : undefined,
      },
    }));
    return [...stages, ...steps];
  }, [graph, placed, selected, stats, trace]);

  const edges = useMemo<PipeEdge[]>(
    () =>
      placed.edges.map((e: RoutedEdge) => {
        const live = trace?.replay ? trace.replay[e.target]?.state === "active" && !!trace.replay[e.source] : false;
        const faded = trace ? !trace.nodes[e.source] || !trace.nodes[e.target] : false;
        return {
          id: e.id,
          type: "pipe",
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          selectable: false,
          focusable: false,
          data: { kind: e.kind, live, faded, label: e.source === "sheet.cast" && e.target === "frame.draw" ? "previous_response_id" : undefined },
        };
      }),
    [placed, trace],
  );

  return (
    <div ref={box} className="size-full">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      onNodeClick={(_, node) => node.type === "step" && onSelect(node.id as GraphNodeId)}
      onPaneClick={() => onSelect(null)}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
      className="pipeline-flow-root"
      style={{ ["--chain" as string]: MODEL_STYLE["muse-image"].color }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--border)" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        style={{ width: 168, height: 96 }}
        className="!rounded-xl !border !border-border !bg-card"
        maskColor="color-mix(in oklab, var(--background) 70%, transparent)"
        nodeColor={(n) => (n.type === "stage" ? "transparent" : MODEL_STYLE[(n.data as StepData).node.model].color)}
        nodeStrokeWidth={0}
        nodeBorderRadius={6}
      />
    </ReactFlow>
    </div>
  );
}
