/**
 * The pipeline page's model colours and the trace replay's clock, without React. Unit-tested.
 */
import type { GraphNodeId, PipelineModel, TraceCall } from "@fabulka/shared";

/** Each model's name and colour on the graph (the same in light and dark: they sit on cards). */
export const MODEL_STYLE: Record<PipelineModel, { name: string; color: string }> = {
  "muse-spark": { name: "Muse Spark", color: "#7c5cff" },
  "muse-image": { name: "Muse Image", color: "#e8833a" },
  sam: { name: "SAM 3.1", color: "#0f9f9a" },
  "muse-voice": { name: "Muse Voice", color: "#d9488f" },
  chromium: { name: "Chromium", color: "#3b82f6" },
  fabulka: { name: "Fabulka", color: "#8a7a6a" },
};

/** A node during the replay: not reached yet, running a call now, or done with all it ran so far. */
export type ReplayNodeState = "idle" | "active" | "done";

export interface ReplayFrame {
  state: ReplayNodeState;
  /** Calls that ended by now. */
  done: number;
  /** A refusal ended a moment ago (the card flashes). */
  refused: boolean;
}

/** How long a refusal keeps flashing, in milliseconds of the book's own time. */
const FLASH_MS = 1500;

/** The run's span: when its first call was sent and its last one ended (ms since epoch). */
export function runSpan(calls: readonly TraceCall[]): { start: number; end: number } {
  if (!calls.length) return { start: 0, end: 0 };
  const start = Math.min(...calls.map((c) => Date.parse(c.startedAt)));
  const end = Math.max(...calls.map((c) => Date.parse(c.endedAt)));
  return { start, end };
}

/** Every node's state at `at` (ms since epoch); nodes without calls are left out. */
export function replayAt(calls: readonly TraceCall[], at: number): Partial<Record<GraphNodeId, ReplayFrame>> {
  const out: Partial<Record<GraphNodeId, ReplayFrame>> = {};
  for (const call of calls) {
    const started = Date.parse(call.startedAt);
    const ended = Date.parse(call.endedAt);
    const f = out[call.node] ?? (out[call.node] = { state: "idle", done: 0, refused: false });
    if (started <= at && at < ended) f.state = "active";
    else if (ended <= at) {
      f.done += 1;
      if (f.state === "idle") f.state = "done";
      if (call.errorCode === "content_policy" && at - ended < FLASH_MS) f.refused = true;
    }
  }
  return out;
}

/** The replay plays a whole run in this many seconds at 1x, whatever its real length. */
export const REPLAY_SECONDS = 24;
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;

/** Seconds as m:ss. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
