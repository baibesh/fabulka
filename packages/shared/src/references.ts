import { z } from "zod";

// ---- Illustrator references (admin «References») -----------------------------------------------
//
// Pictures illustrators prepare so Muse Image draws more thought-through books: there is no
// fine-tuning, only reference pictures sent next to the prompt (input_image parts). The probe on real
// models (2026-11-03) kept these kinds:
// - style: the theme's palette, line and brush texture, on the hero sheet, every page and the cover;
// - composition: a rough staging sketch per method beat (camera distance, where figures stand), on
//   the pages that tell that beat - it worked only when sent first and with few other pictures;
// - character_guide: body proportions for every hero sheet (the face and clothes still come from the
//   story's description).
// A cover layout sketch was tried and left out: Muse Image ignored it; the cover's lettering is placed
// from SAM's mask instead.

export const REFERENCE_KINDS = ["style", "composition", "character_guide"] as const;
export const ReferenceKindSchema = z.enum(REFERENCE_KINDS);
export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;

/** Pictures one slot may hold (a theme's style, a beat's composition, the global character guide). */
export const REFERENCE_SLOT_LIMITS: Record<ReferenceKind, number> = { style: 6, composition: 3, character_guide: 3 };
/**
 * Pictures of each kind sent with one call, at most. Every picture adds input tokens and latency:
 * three full-size style pictures took a page from ~25 s to ~35 s; two at 512 px kept it at ~23 s.
 */
export const REFERENCE_ATTACH: Record<ReferenceKind, number> = { style: 2, composition: 1, character_guide: 1 };
/** An upload, as a file, at most (the browser sends it as a data URL, a third bigger, under nginx's 10 MB). */
export const REFERENCE_MAX_BYTES = 6 * 1024 * 1024;
export const REFERENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** The stored preview's longest side, and the copy sent to the model (smaller: fewer tokens, same effect). */
export const REFERENCE_PREVIEW_PX = 1024;
export const REFERENCE_MODEL_PX = 512;
/** An illustrator's note on a reference, in characters. */
export const REFERENCE_NOTE_MAX = 300;

/** Which pictures a slot is: a theme's (style), a method beat's (composition) or everyone's (guide). */
export interface ReferenceSlot {
  kind: ReferenceKind;
  theme: string | null;
  methodology: string | null;
  beat: number | null;
}

/** The slot's fields as stored: only the ones its kind uses are kept. */
export function slotOf(input: { kind: ReferenceKind; theme?: string | null; methodology?: string | null; beat?: number | null }): ReferenceSlot {
  switch (input.kind) {
    case "style":
      return { kind: "style", theme: input.theme ?? null, methodology: null, beat: null };
    case "composition":
      return { kind: "composition", theme: null, methodology: input.methodology ?? null, beat: input.beat ?? null };
    case "character_guide":
      return { kind: "character_guide", theme: null, methodology: null, beat: null };
  }
}

/** Why a slot is incomplete, or null: style needs a theme, composition a method and a beat. */
export function slotProblem(slot: ReferenceSlot): string | null {
  if (slot.kind === "style" && !slot.theme) return "A style reference belongs to a theme";
  if (slot.kind === "composition" && (!slot.methodology || !slot.beat || slot.beat < 1)) return "A composition reference belongs to a method beat";
  return null;
}

/** Two slots are the same slot. */
export function sameSlot(a: ReferenceSlot, b: ReferenceSlot): boolean {
  return a.kind === b.kind && a.theme === b.theme && a.methodology === b.methodology && a.beat === b.beat;
}

const SlotFieldsSchema = z.object({
  kind: ReferenceKindSchema,
  theme: z.string().trim().min(1).max(60).nullable().optional(),
  methodology: z.string().trim().min(1).max(40).nullable().optional(),
  beat: z.number().int().min(1).max(20).nullable().optional(),
});

/** POST /admin/references: a picture for a slot, as a data URL. */
export const CreateReferenceSchema = SlotFieldsSchema.extend({
  note: z.string().trim().max(REFERENCE_NOTE_MAX).default(""),
  image: z.string().startsWith("data:image/").max(Math.ceil(REFERENCE_MAX_BYTES * 1.37) + 100),
}).superRefine((value, ctx) => {
  const problem = slotProblem(slotOf(value));
  if (problem) ctx.addIssue({ code: "custom", path: ["kind"], message: problem });
});
export type CreateReference = z.input<typeof CreateReferenceSchema>;

/** PATCH /admin/references/:id: switch it on or off, or change its note. */
export const UpdateReferenceSchema = z.object({
  enabled: z.boolean().optional(),
  note: z.string().trim().max(REFERENCE_NOTE_MAX).optional(),
});
export type UpdateReference = z.infer<typeof UpdateReferenceSchema>;

/** PUT /admin/references/order: one slot's pictures in their new order (the first ones are sent first). */
export const ReorderReferencesSchema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(10) });
export type ReorderReferences = z.infer<typeof ReorderReferencesSchema>;

/** A reference as the admin lists it. */
export const IllustratorReferenceSchema = z.object({
  id: z.string(),
  kind: ReferenceKindSchema,
  theme: z.string().nullable(),
  methodology: z.string().nullable(),
  beat: z.number().int().nullable(),
  imageUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  note: z.string(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type IllustratorReference = z.infer<typeof IllustratorReferenceSchema>;

/** Codes of the References refusals (the body's `code`); the admin shows each in its own words. */
export const REFERENCE_ERRORS = ["reference_slot_full", "reference_bad_image", "reference_not_found", "reference_bad_slot", "reference_bad_order"] as const;
export type ReferenceError = (typeof REFERENCE_ERRORS)[number];

/** What a reference needs for picking: its slot, whether it is on and its place in the slot. */
export interface ReferenceChoice extends ReferenceSlot {
  id: string;
  enabled: boolean;
  sortOrder: number;
}

/** A picture Muse Image is asked for: the hero sheet, a story page or the cover. */
export type ReferenceTarget = { kind: "hero" } | { kind: "page"; beat: number | null } | { kind: "cover" };

/**
 * The references sent with one call, in the order they go: the page's beat sketch first (sent after
 * style pictures, Muse Image took it for one more style picture), then the theme's style pictures,
 * then the character guide (hero sheet only). Only enabled ones, each slot in its order, at most
 * REFERENCE_ATTACH of a kind. Pets and toys get none: their sheets chain from the hero's.
 */
export function selectReferences<T extends ReferenceChoice>(refs: readonly T[], book: { theme: string; methodology: string }, target: ReferenceTarget): T[] {
  const pick = (kind: ReferenceKind, match: (r: T) => boolean) =>
    refs
      .filter((r) => r.kind === kind && r.enabled && match(r))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .slice(0, REFERENCE_ATTACH[kind]);
  const style = pick("style", (r) => r.theme === book.theme);
  switch (target.kind) {
    case "hero":
      return [...style, ...pick("character_guide", () => true)];
    case "page": {
      const beat = target.beat;
      const sketch = beat ? pick("composition", (r) => r.methodology === book.methodology && r.beat === beat) : [];
      return [...sketch, ...style];
    }
    case "cover":
      return style;
  }
}

/**
 * The beat a story page tells: Muse Spark's tag when it is one of the method's beats, else the page's
 * share of the book mapped onto the beats in order (pages spread over the beats as the prompt asks).
 * Null for a method without beats.
 */
export function beatOf(tagged: number | null | undefined, page: number, pageCount: number, beats: number): number | null {
  if (beats < 1) return null;
  if (tagged && Number.isInteger(tagged) && tagged >= 1 && tagged <= beats) return tagged;
  const share = (Math.min(Math.max(page, 1), pageCount) - 1) / Math.max(pageCount, 1);
  return Math.min(beats, Math.floor(share * beats) + 1);
}

// ---- Illustrator review: flagged pages ---------------------------------------------------------

/** A page of a book: "cover", "back" or a planned page key such as "story-3". */
export const FlagPageSchema = z.string().regex(/^(cover|back|dedication|talk|end|photo|story-\d{1,3}(-b)?)$/);
export const FLAG_NOTE_MAX = 500;

/** POST /admin/books/:id/flags: an illustrator flags a page with a note. */
export const CreatePageFlagSchema = z.object({
  page: FlagPageSchema,
  note: z.string().trim().min(1).max(FLAG_NOTE_MAX),
});
export type CreatePageFlag = z.infer<typeof CreatePageFlagSchema>;

/** PATCH /admin/flags/:id: done with it (or opened again). */
export const UpdatePageFlagSchema = z.object({ resolved: z.boolean() });

export const PageFlagSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  bookTitle: z.string().nullable(),
  page: z.string(),
  note: z.string(),
  resolved: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type PageFlag = z.infer<typeof PageFlagSchema>;
