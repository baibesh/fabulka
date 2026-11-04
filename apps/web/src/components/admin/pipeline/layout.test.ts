import { COMIC, DEFAULT_STORY_FORMATS, pipelineGraph } from "@fabulka/shared";
import { describe, expect, it } from "vitest";
import { NODE_H, NODE_W, layoutGraph } from "./layout";

const graph = pipelineGraph(DEFAULT_STORY_FORMATS.find((f) => f.slug === COMIC)!);

/** Whether two placed cards overlap. */
const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;

describe("layoutGraph", () => {
  for (const mode of ["stages", "flow"] as const) {
    it(`places every node without overlaps (${mode})`, () => {
      const { positions, edges } = layoutGraph(graph, mode);
      const placed = graph.nodes.map((n) => positions[n.id]!);
      expect(placed.every(Boolean)).toBe(true);
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i], placed[j])).toBe(false);
      expect(edges).toHaveLength(graph.edges.length);
    });
  }

  it("reads left to right in five columns, each stage framed, and routes edges by where cards sit", () => {
    const { positions, stages, edges } = layoutGraph(graph, "stages");
    expect(stages.map((s) => s.stage)).toEqual(["wizard", "inputs", "story", "sheets", "pictures", "layout", "after"]);
    expect(new Set(graph.nodes.map((n) => positions[n.id]!.x)).size).toBe(5);
    expect(positions["story.write"]!.x).toBeGreaterThan(positions["toy.cutout"]!.x);
    expect(positions["frame.draw"]!.x).toBeGreaterThan(positions["sheet.cast"]!.x);
    expect(positions["voice.transcribe"]!.x).toBe(positions["hero.describe"]!.x);
    // Every card sits inside its stage's frame.
    for (const node of graph.nodes) {
      const box = stages.find((s) => s.stage === node.stage)!;
      const p = positions[node.id]!;
      expect(p.x >= box.x && p.x + NODE_W <= box.x + box.w && p.y >= box.y && p.y + NODE_H <= box.y + box.h).toBe(true);
    }
    const route = (s: string, t: string) => edges.find((e) => e.source === s && e.target === t);
    expect(route("sheet.hero", "sheet.pet")).toMatchObject({ sourceHandle: "b", targetHandle: "t" });
    expect(route("story.review", "sheet.hero")).toMatchObject({ sourceHandle: "r", targetHandle: "l" });
    expect(route("frame.rewrite", "frame.draw")).toMatchObject({ sourceHandle: "r", targetHandle: "rt" });
    expect(route("frame.draw", "frame.mask")).toMatchObject({ sourceHandle: "ls", targetHandle: "l" });
  });
});
