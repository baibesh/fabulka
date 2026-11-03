import { z } from "zod";
import { CountryCodeSchema } from "./reference";
import { MarginSchema, RevenueSchema } from "./money";

// ---- Activity: who changed what in the admin ----------------------------------------------------
//
// Every admin write leaves an AuditEvent: who (staff id, email, roles at the time), which section
// (a permission key) and action (a code below), on what (a target type and id), in which country,
// and a short machine-readable summary of the change. The admin's «Activity» builds each row's text
// from these codes in its own language; the server never sends prose.

/** What staff did: the admin shows each in its own words (admin.activity.action.<code>). */
export const AUDIT_ACTIONS = [
  "staff.invite",
  "staff.update",
  "staff.disable",
  "staff.enable",
  "staff.resend",
  "staff.cap",
  "role.create",
  "role.update",
  "role.delete",
  "caps.defaults",
  "prices.set",
  "prices.clear",
  "fx.set",
  "fx.clear",
  "fx.refresh",
  "landing.set",
  "landing.clear",
  "cities.set",
  "delivery.set",
  "delivery.clear",
  "formats_country.set",
  "formats_country.clear",
  "countries.set",
  "faq.set",
  "formats.set",
  "blocked.set",
  "template.update",
  "template.visibility",
  "template.sample",
  "example.create",
  "example.update",
  "example.delete",
  "example.order",
  "example.version_add",
  "example.version_remove",
  "example.translate",
  "order.status",
  "generation.pause",
  "generation.resume",
  "book.layout",
  "book.delete",
  "theme.propose",
  "theme.publish",
  "theme.unpublish",
  "theme.delete",
  "methodology.create",
  "methodology.update",
  "methodology.delete",
  "seo.save",
  "seo.publish",
  "seo.revert",
  "seo.image",
  "seo.redirect_create",
  "seo.redirect_update",
  "seo.redirect_delete",
  "seo.settings",
  /** A write no route named: the details show its method and path. */
  "other",
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** One changed value: its path in the object ("books.template.KZT"), before and after. */
export const AuditChangeSchema = z.object({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditChange = z.infer<typeof AuditChangeSchema>;

/**
 * What changed: the changed values with before and after for small objects, only the changed paths
 * (`keys`) for big ones, and a few facts about the action (`data`: the new status, the languages a
 * translation was started in, the SEO history entries). `truncated` when something was cut to fit.
 */
export const AuditSummarySchema = z.object({
  changes: z.array(AuditChangeSchema).optional(),
  keys: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  truncated: z.boolean().optional(),
});
export type AuditSummary = z.infer<typeof AuditSummarySchema>;

/** An event as the Activity list shows it. */
export const AuditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorEmail: z.string().nullable(),
  actorStaffId: z.string().nullable(),
  actorRoles: z.array(z.string()),
  /** The admin section (a permission key: "reference", "team", "examples"…). */
  section: z.string(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  /** The country the change belongs to (a country's prices, a German order); null for global data. */
  country: z.string().nullable(),
  summary: AuditSummarySchema,
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /admin/activity (and /admin/activity.csv): filters, newest first. */
export const AuditQuerySchema = z.object({
  /** Someone's email. */
  actor: z.string().trim().toLowerCase().max(200).optional(),
  section: z.string().trim().max(40).optional(),
  country: CountryCodeSchema.optional(),
  /** First and last day, inclusive (UTC). */
  from: DaySchema.optional(),
  to: DaySchema.optional(),
  /** Text in the email, action or target. */
  q: z.string().trim().max(100).optional(),
  /** The `nextCursor` of the previous page. */
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.input<typeof AuditQuerySchema>;

export const AuditPageSchema = z.object({
  events: z.array(AuditEventSchema),
  nextCursor: z.string().nullable(),
});
export type AuditPage = z.infer<typeof AuditPageSchema>;

/** Events are kept at least this long. */
export const AUDIT_RETENTION_DAYS = 400;

// ---- Generation caps for staff -------------------------------------------------------------------
//
// Staff actions that call paid models (example translations, theme proposals) count against a daily
// budget in dollars per person and per country, from the model cost the journal records (ModelCall).
// The superadmin sets the defaults and per-person overrides in Team; superadmins are uncapped unless
// given a cap of their own. The service-wide MODEL_BUDGET_USD and the generation pause stay as they are.

/** Body code of a 429 when a staff action would spend past a daily cap. */
export const STAFF_CAP_REACHED = "staff_cap_reached";

const UsdSchema = z.number().min(0).max(10_000);

/** The defaults: null is no cap. */
export const StaffCapDefaultsSchema = z.object({
  /** Each person's daily budget, in dollars. */
  personUsd: UsdSchema.nullable(),
  /** Each country's daily budget for staff generation, in dollars. */
  countryUsd: UsdSchema.nullable(),
});
export type StaffCapDefaults = z.infer<typeof StaffCapDefaultsSchema>;

export const NO_STAFF_CAPS: StaffCapDefaults = { personUsd: null, countryUsd: null };

/** PUT /admin/team/:id/cap: their own daily budget (null: the default), or no cap at all. */
export const StaffCapOverrideSchema = z.object({
  capUsd: UsdSchema.nullable(),
  uncapped: z.boolean().default(false),
});
export type StaffCapOverride = z.input<typeof StaffCapOverrideSchema>;

const BudgetLineSchema = z.object({
  /** null: no cap. */
  capUsd: z.number().nullable(),
  spentUsd: z.number(),
  remainingUsd: z.number().nullable(),
});

/** What a staff member may still spend today (GET /admin/caps/me?country=). */
export const StaffBudgetSchema = z.object({
  person: BudgetLineSchema,
  /** The country the action is for; null when it is for no country. */
  country: BudgetLineSchema.extend({ code: z.string() }).nullable(),
  /** The smaller remainder; null when nothing caps it. */
  remainingUsd: z.number().nullable(),
  allowed: z.boolean(),
});
export type StaffBudget = z.infer<typeof StaffBudgetSchema>;

/** One country's staff generation today, with its cap. */
export const CountrySpendSchema = z.object({
  country: z.string().nullable(),
  usd: z.number(),
  capUsd: z.number().nullable(),
});
export type CountrySpend = z.infer<typeof CountrySpendSchema>;

/**
 * Today's budget: what is left of `capUsd` after `spentUsd` (never below 0), or null with no cap.
 */
export function remaining(capUsd: number | null, spentUsd: number): number | null {
  if (capUsd === null) return null;
  return Math.max(0, Math.round((capUsd - spentUsd) * 10_000) / 10_000);
}

/**
 * Someone's daily cap: none when they are marked uncapped; their own when set; none for a
 * superadmin otherwise; else the default.
 */
export function personCap(
  member: { capUsd: number | null; uncapped: boolean } | null,
  superadmin: boolean,
  defaults: StaffCapDefaults,
): number | null {
  if (member?.uncapped) return null;
  if (member && member.capUsd !== null) return member.capUsd;
  if (superadmin) return null;
  return defaults.personUsd;
}

/**
 * The budget for one action: a person's line and, for a country's action, that country's (the
 * caller passes no country cap for someone uncapped: their spend still counts towards it). Allowed
 * while every line that caps has something left.
 */
export function budgetOf(input: {
  personCapUsd: number | null;
  personSpentUsd: number;
  country: string | null;
  countryCapUsd: number | null;
  countrySpentUsd: number;
}): StaffBudget {
  const person = {
    capUsd: input.personCapUsd,
    spentUsd: input.personSpentUsd,
    remainingUsd: remaining(input.personCapUsd, input.personSpentUsd),
  };
  const country = input.country
    ? {
        code: input.country,
        capUsd: input.countryCapUsd,
        spentUsd: input.countrySpentUsd,
        remainingUsd: remaining(input.countryCapUsd, input.countrySpentUsd),
      }
    : null;
  const left = [person.remainingUsd, country?.remainingUsd ?? null].filter((n): n is number => n !== null);
  const remainingUsd = left.length ? Math.min(...left) : null;
  return { person, country, remainingUsd, allowed: remainingUsd === null || remainingUsd > 0 };
}

/** Staff generation by country today, for the dashboards. */
export const StaffSpendSchema = z.array(CountrySpendSchema);

/** GET /admin/stats/countries: a country manager's dashboard, their countries only. */
export const CountryStatsSchema = z.object({
  countries: z.array(z.string()),
  books: z.object({
    total: z.number().int(),
    today: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
  orders: z.object({
    total: z.number().int(),
    today: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
    /** Order revenue by currency, and roughly in dollars. */
    revenue: RevenueSchema,
    /** Print margin of the orders with print partner costs known; null when none had them. */
    margin: MarginSchema.nullable(),
  }),
  spend: z.object({
    /** Model spend on books made in these countries today. */
    booksTodayUsd: z.number(),
    /** Staff generation per country today, with each one's cap. */
    staff: StaffSpendSchema,
  }),
});
export type CountryStats = z.infer<typeof CountryStatsSchema>;
