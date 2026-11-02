import { z } from "zod";
import { LanguageSchema } from "./language";

// ---- SEO (admin «SEO») -----------------------------------------------------------------------
//
// SEO is set per LANGUAGE version of a page, not per country: each language has its own addresses
// (/catalog, /de/catalog), and search engines index those separately. The country only changes
// prices and the catalog, never the address, so what is country-wide (verification codes,
// analytics, robots.txt) lives in the global settings.

/** The site's fixed public pages that have SEO of their own. */
export const SEO_STATIC_PAGES = ["home", "catalog", "create", "privacy", "terms"] as const;
export type SeoStaticPage = (typeof SEO_STATIC_PAGES)[number];

const STATIC_PATHS: Record<SeoStaticPage, string> = {
  home: "/",
  catalog: "/catalog",
  create: "/create",
  privacy: "/privacy",
  terms: "/terms",
};

/**
 * A page's key: a fixed page by name, a catalog book as `template:<slug>`, an example book as
 * `book:<id>`.
 */
export const SeoPageKeySchema = z
  .string()
  .regex(/^(home|catalog|create|privacy|terms|template:[a-z0-9][a-z0-9-]{0,79}|book:[A-Za-z0-9_-]{1,40})$/, "Unknown page");
export type SeoPageKey = z.infer<typeof SeoPageKeySchema>;

export type SeoPageKind = "static" | "template" | "book";

export function seoPageKind(key: string): SeoPageKind {
  if (key.startsWith("template:")) return "template";
  if (key.startsWith("book:")) return "book";
  return "static";
}

/** The site path of a page (without a language prefix): `/`, `/catalog/bath-time`, `/books/<id>`. */
export function seoPagePath(key: string): string {
  if (key.startsWith("template:")) return `/catalog/${key.slice("template:".length)}`;
  if (key.startsWith("book:")) return `/books/${key.slice("book:".length)}`;
  return STATIC_PATHS[key as SeoStaticPage] ?? "/";
}

/** Lengths search engines show before cutting: the counters in the admin warn past these. */
export const SEO_TITLE_LIMIT = 60;
export const SEO_DESCRIPTION_LIMIT = 160;
/** Below these a snippet is usually too thin to be useful (a warning, not an error). */
export const SEO_TITLE_MIN = 15;
export const SEO_DESCRIPTION_MIN = 50;

/** An optional text: blank means "use the default". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** A stored OG image: a file the admin uploaded, under the storage's seo/ folder. */
export const SeoImagePathSchema = z.string().regex(/^seo\/[a-z0-9-]{1,80}\.jpg$/, "Not an uploaded image");

/** What staff set for one page in one language; null fields fall back to the defaults. */
export const SeoFieldsSchema = z.object({
  title: optionalText(200),
  description: optionalText(500),
  ogImage: SeoImagePathSchema.nullable(),
  noindex: z.boolean(),
});
export type SeoFields = z.infer<typeof SeoFieldsSchema>;

export const EMPTY_SEO_FIELDS: SeoFields = { title: null, description: null, ogImage: null, noindex: false };

/** True when nothing is set: the page runs on its defaults. */
export function seoFieldsEmpty(fields: SeoFields): boolean {
  return !fields.title && !fields.description && !fields.ogImage && !fields.noindex;
}

export function sameSeoFields(a: SeoFields | null, b: SeoFields | null): boolean {
  const x = a ?? EMPTY_SEO_FIELDS;
  const y = b ?? EMPTY_SEO_FIELDS;
  return x.title === y.title && x.description === y.description && x.ogImage === y.ogImage && x.noindex === y.noindex;
}

/** What the site serves for a page: the published fields, the image as a URL. */
export const PublishedSeoSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  ogImageUrl: z.string().nullable(),
  noindex: z.boolean(),
});
export type PublishedSeo = z.infer<typeof PublishedSeoSchema>;

/** GET /seo/pages?lang=xx: the published SEO of every page that has any, by page key. */
export const PublicSeoPagesSchema = z.record(z.string(), PublishedSeoSchema);
export type PublicSeoPages = z.infer<typeof PublicSeoPagesSchema>;

/** A page in the admin's list for one language, with what it needs for its default texts. */
export const AdminSeoPageSchema = z.object({
  key: z.string(),
  path: z.string(),
  kind: z.enum(["static", "template", "book"]),
  /** The catalog book's title in this language, or the example book's title; null for fixed pages. */
  label: z.string().nullable(),
  /** The catalog book's summary in this language. */
  summary: z.string().nullable(),
  /** The catalog book's or example book's cover, for the default OG image. */
  coverUrl: z.string().nullable(),
  /** What staff are editing. */
  draft: SeoFieldsSchema,
  /** What the site serves; null until first published. */
  published: SeoFieldsSchema.nullable(),
  /** The draft differs from what is published. */
  pending: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type AdminSeoPage = z.infer<typeof AdminSeoPageSchema>;

/** Body of PUT /admin/seo/page: save the draft of one page in one language. */
export const SaveSeoPageSchema = z.object({ key: SeoPageKeySchema, language: LanguageSchema, fields: SeoFieldsSchema });
export type SaveSeoPage = z.infer<typeof SaveSeoPageSchema>;

/** Body of POST /admin/seo/publish: one page in one language, or (empty) everything pending. */
export const PublishSeoSchema = z.union([
  z.object({ key: SeoPageKeySchema, language: LanguageSchema }),
  z.object({}).strict(),
]);
export type PublishSeo = z.infer<typeof PublishSeoSchema>;

/** What a publish did: pages made live, the site told to re-render, IndexNow pinged. */
export const PublishSeoResultSchema = z.object({
  published: z.number().int(),
  urls: z.array(z.string()),
  revalidated: z.boolean(),
  indexNow: z.enum(["sent", "off", "failed", "skipped"]),
});
export type PublishSeoResult = z.infer<typeof PublishSeoResultSchema>;

/** Body of POST /admin/seo/og-image: a JPEG, PNG or WebP as a data URL (at most 5 MB). */
export const SEO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SeoImageUploadSchema = z.object({
  image: z
    .string()
    .regex(/^data:[\w.+/-]*;base64,[A-Za-z0-9+/=]+$/, "A base64 data URL")
    .max(Math.ceil((SEO_IMAGE_MAX_BYTES * 4) / 3) + 100),
});
export const SeoImageResultSchema = z.object({ path: SeoImagePathSchema, url: z.string() });
export type SeoImageResult = z.infer<typeof SeoImageResultSchema>;

// ---- History -----------------------------------------------------------------------------------

export const SEO_HISTORY_KINDS = ["page", "redirect", "settings"] as const;
export const SEO_HISTORY_ACTIONS = ["save", "publish", "revert", "create", "update", "delete"] as const;

/** One recorded change: who, when, and the values before and after. */
export const SeoHistoryEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(SEO_HISTORY_KINDS),
  /** `<page key>@<language>` for a page, the redirect's id, or "settings". */
  target: z.string(),
  action: z.enum(SEO_HISTORY_ACTIONS),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  who: z.string().nullable(),
  createdAt: z.string(),
});
export type SeoHistoryEntry = z.infer<typeof SeoHistoryEntrySchema>;

/** The history target of a page in a language. */
export const seoPageTarget = (key: string, language: string) => `${key}@${language}`;

// ---- Redirects ---------------------------------------------------------------------------------

/** Where a redirect may not start: the admin, the API, files, Next's own files, the revalidation route. */
export const REDIRECT_RESERVED = ["/admin", "/api", "/files", "/_next", "/internal"] as const;

export const RedirectInputSchema = z.object({
  from: z.string().trim().min(1).max(300),
  to: z.string().trim().min(1).max(500),
  status: z.union([z.literal(301), z.literal(302)]),
  active: z.boolean(),
});
export type RedirectInput = z.infer<typeof RedirectInputSchema>;

export const RedirectSchema = RedirectInputSchema.extend({ id: z.string(), createdAt: z.string(), updatedAt: z.string() });
export type Redirect = z.infer<typeof RedirectSchema>;

/** GET /seo/redirects: the active ones, for the site's proxy. */
export const PublicRedirectSchema = z.object({ from: z.string(), to: z.string(), status: z.union([z.literal(301), z.literal(302)]) });
export type PublicRedirect = z.infer<typeof PublicRedirectSchema>;

/** Body of a 400 from the redirect routes: `reason` says what is wrong. */
export const REDIRECT_INVALID = "redirect_invalid";
export const REDIRECT_PROBLEMS = ["from_invalid", "to_invalid", "reserved", "file", "self", "loop", "duplicate"] as const;
export type RedirectProblem = (typeof REDIRECT_PROBLEMS)[number];

/** `/old/` → `/old`; the root stays `/`. */
export function normalizeRedirectPath(path: string): string {
  const trimmed = path.trim();
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

/** The site path a target points at, when it stays on this site (a path, or an absolute URL on `siteHost`). */
function internalPath(to: string, siteHost?: string): string | null {
  if (to.startsWith("/") && !to.startsWith("//")) return normalizeRedirectPath(to.split(/[?#]/)[0]);
  if (!siteHost) return null;
  try {
    const url = new URL(to);
    return url.host === siteHost ? normalizeRedirectPath(url.pathname) : null;
  } catch {
    return null;
  }
}

/**
 * What is wrong with a redirect, or null: `from` must be a plain site path (no query, no file
 * extension, not the admin/API/files), `to` a site path or an http(s) URL, not itself, not a second
 * redirect from the same path, and active redirects must not form a loop (`/a` → `/b` → `/a`).
 * `others` are the stored redirects except the one being edited; `siteHost` lets absolute URLs on
 * this site count in the loop check.
 */
export function redirectProblem(
  input: RedirectInput,
  others: readonly Pick<Redirect, "from" | "to" | "active">[],
  siteHost?: string,
): RedirectProblem | null {
  const from = normalizeRedirectPath(input.from);
  if (!/^\/[A-Za-z0-9\-._~/%]*$/.test(from) || from.includes("//")) return "from_invalid";
  if (REDIRECT_RESERVED.some((p) => from === p || from.startsWith(`${p}/`))) return "reserved";
  // The site's proxy never sees paths with a file extension (robots.txt, covers): they are not redirectable.
  if (/\.[A-Za-z0-9]+$/.test(from.split("/").pop() ?? "")) return "file";
  const to = input.to.trim();
  const local = to.startsWith("/") && !to.startsWith("//");
  if (!local) {
    try {
      const url = new URL(to);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "to_invalid";
    } catch {
      return "to_invalid";
    }
  } else if (/\s/.test(to)) return "to_invalid";
  if (internalPath(to, siteHost) === from) return "self";
  if (others.some((r) => normalizeRedirectPath(r.from) === from)) return "duplicate";
  if (!input.active) return null;
  // Follow the chain from the new target through the active redirects: reaching `from` again is a loop.
  const next = new Map(others.filter((r) => r.active).map((r) => [normalizeRedirectPath(r.from), r.to]));
  const seen = new Set<string>([from]);
  let at = internalPath(to, siteHost);
  while (at !== null) {
    if (seen.has(at)) return "loop";
    seen.add(at);
    const target = next.get(at);
    at = target === undefined ? null : internalPath(target, siteHost);
  }
  return null;
}

/** The redirect for a request path among the active ones, or undefined. */
export function findRedirect<T extends { from: string }>(redirects: readonly T[], pathname: string): T | undefined {
  const path = normalizeRedirectPath(pathname);
  return redirects.find((r) => normalizeRedirectPath(r.from) === path);
}

// ---- Global settings (Setting table) -----------------------------------------------------------

/** Setting keys of the SEO settings, like REFERENCE_KEYS. */
export const SEO_KEYS = {
  verification: "seo.verification",
  analytics: "seo.analytics",
  robots: "seo.robots",
  sitemap: "seo.sitemap",
} as const;

const optionalId = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value || pattern.test(value), message);

/** The content of a search console's verification meta tag (the code only, not the whole tag). */
const verificationCode = optionalId(/^[A-Za-z0-9_\-=.:]{4,200}$/, "Paste only the code from the tag's content=\"…\"");

export const SeoVerificationSchema = z.object({ google: verificationCode, yandex: verificationCode, bing: verificationCode });
export type SeoVerification = z.infer<typeof SeoVerificationSchema>;

export const SeoAnalyticsSchema = z.object({
  gtm: optionalId(/^GTM-[A-Z0-9]{4,12}$/, "GTM-XXXXXXX"),
  ga4: optionalId(/^G-[A-Z0-9]{4,15}$/, "G-XXXXXXXXXX"),
  yandexMetrika: optionalId(/^\d{4,12}$/, "Digits only"),
  metaPixel: optionalId(/^\d{6,20}$/, "Digits only"),
});
export type SeoAnalytics = z.infer<typeof SeoAnalyticsSchema>;

const ROBOTS_LINE = /^(#.*|(user-agent|allow|disallow|crawl-delay|sitemap|host|clean-param)\s*:.*)$/i;

/** Extra robots.txt lines: only robots directives and comments, one per line. */
export const SeoRobotsSchema = z
  .string()
  .max(4000)
  .transform((text) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .join("\n")
      .trim(),
  )
  .refine((text) => text.split("\n").every((line) => !line || ROBOTS_LINE.test(line)), "Only User-agent, Allow, Disallow, Crawl-delay, Sitemap, Host, Clean-param lines and # comments");

export const SeoSettingsSchema = z.object({
  verification: SeoVerificationSchema,
  analytics: SeoAnalyticsSchema,
  /** Appended to the site's robots.txt. */
  robots: SeoRobotsSchema,
  /** List the example books in the sitemap. */
  sitemapExamples: z.boolean(),
});
export type SeoSettings = z.infer<typeof SeoSettingsSchema>;

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  verification: { google: "", yandex: "", bing: "" },
  analytics: { gtm: "", ga4: "", yandexMetrika: "", metaPixel: "" },
  robots: "",
  sitemapExamples: true,
};

/** True when any analytics is set up: only then does the site ask for cookie consent. */
export function analyticsConfigured(analytics: SeoAnalytics): boolean {
  return Boolean(analytics.gtm || analytics.ga4 || analytics.yandexMetrika || analytics.metaPixel);
}

/** The cookie that keeps the visitor's answer to the consent banner: "granted" or "denied". */
export const CONSENT_COOKIE = "fabulka_consent";
