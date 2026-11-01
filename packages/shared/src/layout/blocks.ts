import { z } from "zod";
import { type BlockKind, BlockKindSchema, type BookLayout, type LayoutBlock, LayoutBlockSchema } from "./model";

/** Kinds a parent may add, remove and move (when the template allows): never the cover, story or end. */
export const OPTIONAL_KINDS = ["dedication", "talk", "drawing"] as const satisfies readonly BlockKind[];
/** How many of each optional block a book may have. */
export const BLOCK_LIMITS: Record<BlockKind, number> = { cover: 1, dedication: 1, story: 1, talk: 1, drawing: 4, end: 1 };
/** A parent's dedication, in characters. */
export const DEDICATION_MAX = 160;

/**
 * The parent's dedication: plain text, one to DEDICATION_MAX characters, no markup (the renderer
 * escapes it anyway; angle brackets and control characters are refused so nothing looks like HTML).
 */
export const DedicationSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(DEDICATION_MAX)
      .refine((s) => !/[<>\u0000-\u001f\u007f]/.test(s), "No markup"),
  );

/**
 * The blocks a catalog book offers: its default order (with which ones the parent may move or leave
 * out) and the optional kinds the parent may add. Set by staff in the template editor.
 */
export const TemplateBlocksSchema = z
  .object({
    order: z.array(LayoutBlockSchema).min(3).max(10),
    addable: z.array(z.enum(OPTIONAL_KINDS)).max(OPTIONAL_KINDS.length),
  })
  .superRefine((value, ctx) => {
    const problem = blocksProblem(value.order);
    if (problem) ctx.addIssue({ code: "custom", path: ["order"], message: problem });
  });
export type TemplateBlocks = z.infer<typeof TemplateBlocksSchema>;

/** Why a block list cannot be a book, or null: cover first, end last, one story, fixed blocks fixed, limits kept. */
export function blocksProblem(blocks: readonly LayoutBlock[]): string | null {
  if (blocks[0]?.kind !== "cover") return "The cover comes first";
  if (blocks.at(-1)?.kind !== "end") return "The end comes last";
  for (const kind of BlockKindSchema.options) {
    const count = blocks.filter((b) => b.kind === kind).length;
    if (count > BLOCK_LIMITS[kind]) return `Too many ${kind} blocks`;
  }
  if (!blocks.some((b) => b.kind === "story")) return "The story is missing";
  for (const block of blocks) {
    if (!(OPTIONAL_KINDS as readonly string[]).includes(block.kind) && (block.movable || block.optional)) {
      return `The ${block.kind} never moves and cannot be left out`;
    }
  }
  return null;
}

/** Why the parent's new order of block kinds is refused, as a short code for the API's 400. */
export type ArrangeProblem = "shape" | "fixed-moved" | "required-removed" | "not-addable" | "too-many";

/**
 * The layout with its blocks in the parent's new order (a list of kinds). Flags come from the
 * layout, never from the parent: a block they may not move stays where it is relative to the other
 * fixed blocks, one they may not leave out stays, and only kinds the template offers can be added.
 */
export function arrangeBlocks(layout: BookLayout, kinds: readonly BlockKind[]): { layout: BookLayout } | { problem: ArrangeProblem } {
  const current = layout.blocks;
  const flags = (kind: BlockKind): Omit<LayoutBlock, "kind"> => {
    const block = current.find((b) => b.kind === kind);
    return block ? { movable: block.movable, optional: block.optional } : { movable: true, optional: true };
  };
  const next: LayoutBlock[] = kinds.map((kind) => ({ kind, ...flags(kind) }));
  for (const kind of BlockKindSchema.options) {
    const before = current.filter((b) => b.kind === kind).length;
    const after = next.filter((b) => b.kind === kind).length;
    if (after > BLOCK_LIMITS[kind]) return { problem: "too-many" };
    if (after < before && current.some((b) => b.kind === kind && !b.optional)) return { problem: "required-removed" };
    if (after > before && !layout.addable.includes(kind)) return { problem: "not-addable" };
  }
  // Fixed blocks that stay keep their order among themselves (cover, story, end, any the template fixed).
  const kept = new Set(next.map((b) => b.kind));
  const fixed = (list: readonly LayoutBlock[]) => list.filter((b) => !b.movable && kept.has(b.kind)).map((b) => b.kind);
  if (fixed(current).join() !== fixed(next).join()) return { problem: "fixed-moved" };
  if (blocksProblem(next)) return { problem: "shape" };
  return { layout: { ...layout, blocks: next, dedication: next.some((b) => b.kind === "dedication") ? layout.dedication : null } };
}
