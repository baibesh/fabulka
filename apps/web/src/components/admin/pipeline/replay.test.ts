import type { TraceCall } from "@fabulka/shared";
import { describe, expect, it } from "vitest";
import { clock, replayAt, runSpan } from "./replay";

const t0 = Date.parse("2026-11-04T10:00:00Z");
const call = (node: TraceCall["node"], from: number, to: number, errorCode: string | null = null): TraceCall => ({
  id: `${node}-${from}`,
  node,
  kind: "page",
  model: "mock",
  status: errorCode ? "error" : "ok",
  errorCode,
  attempt: 1,
  page: null,
  frame: null,
  latencyMs: to - from,
  costUsd: 0,
  startedAt: new Date(t0 + from).toISOString(),
  endedAt: new Date(t0 + to).toISOString(),
  prompt: null,
  output: null,
});

describe("replay", () => {
  const calls = [call("story.write", 0, 3000), call("frame.draw", 4000, 6000, "content_policy"), call("frame.draw", 6000, 9000)];

  it("spans the run", () => {
    expect(runSpan(calls)).toEqual({ start: t0, end: t0 + 9000 });
    expect(runSpan([])).toEqual({ start: 0, end: 0 });
  });

  it("lights the nodes in the order their calls ran", () => {
    expect(replayAt(calls, t0 + 1000)).toEqual({
      "story.write": { state: "active", done: 0, refused: false },
      "frame.draw": { state: "idle", done: 0, refused: false },
    });
    expect(replayAt(calls, t0 + 6500)["frame.draw"]).toEqual({ state: "active", done: 1, refused: true });
    expect(replayAt(calls, t0 + 9000)).toEqual({
      "story.write": { state: "done", done: 1, refused: false },
      "frame.draw": { state: "done", done: 2, refused: false },
    });
  });

  it("writes a clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(125_400)).toBe("2:05");
  });
});
