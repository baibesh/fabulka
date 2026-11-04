import { z } from "zod";
import { OverviewGapSchema } from "./examples";
import { LanguageSchema } from "./language";

// ---- The admin's Inbox and command palette search ----------------------------------------------
//
// The Inbox is each workspace's home page: things that wait for someone, each with the page that
// fixes it. The API builds it (GET /admin/inbox, ?country= for a country workspace) from cheap
// counts, limited to what the session may open; the admin only words it.

/**
 * What an Inbox row is about:
 * - generation_paused: book generation is paused (Settings, Generation);
 * - failed_books: books that failed in the last days;
 * - orders_waiting: orders not delivered yet, whose stage someone moves by hand;
 * - new_orders: a country's orders still at "paid" (not sent to print yet);
 * - spend_budget: the model budget is nearly spent;
 * - daily_cap: today's book cap (regular or demo) is nearly reached;
 * - staff_spend: a country's staff generation today is near its daily cap;
 * - page_flags: pages illustrators flagged in review, still open;
 * - seo_drafts: SEO drafts in a language waiting to be published;
 * - gap: something a country's visitors miss (OVERVIEW_GAPS, see the country overview).
 */
export const INBOX_KINDS = [
  "generation_paused",
  "failed_books",
  "orders_waiting",
  "new_orders",
  "spend_budget",
  "daily_cap",
  "staff_spend",
  "page_flags",
  "seo_drafts",
  "gap",
] as const;
export const InboxKindSchema = z.enum(INBOX_KINDS);
export type InboxKind = z.infer<typeof InboxKindSchema>;

/** How urgent a row is: danger first, then warning, then info. */
export const INBOX_SEVERITIES = ["danger", "warning", "info"] as const;
export const InboxSeveritySchema = z.enum(INBOX_SEVERITIES);
export type InboxSeverity = z.infer<typeof InboxSeveritySchema>;

/** A thing the row lists by name (a failed book, a flagged page), with its own page. */
export const InboxSampleSchema = z.object({ id: z.string(), label: z.string(), href: z.string() });
export type InboxSample = z.infer<typeof InboxSampleSchema>;

export const InboxItemSchema = z.object({
  kind: InboxKindSchema,
  severity: InboxSeveritySchema,
  /** How many things wait (for spend: the share used, in percent). */
  count: z.number().int(),
  /** The gap's code, for kind "gap". */
  gap: OverviewGapSchema.optional(),
  language: LanguageSchema.optional(),
  /** The country the row is about (staff spend in the global Inbox). */
  country: z.string().optional(),
  /** Numbers the row's words need: used and limit for spend and caps, "regular" or "demo" for a cap. */
  detail: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  /** The admin page that fixes it (without the working country; the admin adds it), or null when the session cannot fix it. */
  href: z.string().nullable(),
  samples: z.array(InboxSampleSchema).default([]),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;

/** GET /admin/inbox: the global workspace's rows, or one country's (?country=). */
export const InboxSchema = z.object({
  country: z.string().nullable(),
  items: z.array(InboxItemSchema),
});
export type Inbox = z.infer<typeof InboxSchema>;

/** Most urgent first; among equals, the order the API put them in. */
export function sortInbox(items: readonly InboxItem[]): InboxItem[] {
  const rank = (item: InboxItem) => INBOX_SEVERITIES.indexOf(item.severity);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** Share of a limit that counts as "near": 80%. */
export const NEAR_LIMIT = 0.8;

/** GET /admin/search?q=: books by title, child's name or id; orders by number (id). */
export const AdminSearchSchema = z.object({
  books: z.array(z.object({ id: z.string(), title: z.string().nullable(), childName: z.string(), status: z.string() })),
  orders: z.array(z.object({ id: z.string(), country: z.string().nullable(), status: z.string(), bookTitle: z.string().nullable() })),
});
export type AdminSearch = z.infer<typeof AdminSearchSchema>;
