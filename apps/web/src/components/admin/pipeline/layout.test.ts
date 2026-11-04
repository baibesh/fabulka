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

  it("reads left to right by stage and keeps side steps beside their anchor", () => {
    const { positions, stages, edges } = layoutGraph(graph, "stages");
    expect(stages.map((s) => s.stage)).toEqual(["wizard", "inputs", "story", "sheets", "pictures", "layout", "after"]);
    expect(positions["story.write"]!.x).toBeGreaterThan(positions["toy.cutout"]!.x);
    expect(positions["frame.draw"]!.x).toBeGreaterThan(positions["sheet.cast"]!.x);
    expect(positions["photo.delete"]!.y).toBe(positions["sheet.hero"]!.y);
    expect(positions["photo.delete"]!.x).toBeGreaterThan(positions["sheet.hero"]!.x);
    const route = (s: string, t: string) => edges.find((e) => e.source === s && e.target === t);
    expect(route("sheet.hero", "sheet.pet")).toMatchObject({ sourceHandle: "b", targetHandle: "t" });
    expect(route("story.review", "sheet.hero")).toMatchObject({ sourceHandle: "r", targetHandle: "l" });
    expect(route("frame.rewrite", "frame.draw")).toMatchObject({ sourceHandle: "b", targetHandle: "bt" });
  });
});
