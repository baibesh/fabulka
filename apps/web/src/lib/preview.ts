import { ISO_COUNTRY_CODES, OTHER_COUNTRY, isLanguage, localePath, type Language } from "@fabulka/shared";
import { COOKIE_MAX_AGE, COUNTRY_COOKIE } from "../i18n/cookies";

/** The site's pages a preview may open (the landing by default). Nothing else: no open redirect. */
const PAGES = { home: "/", catalog: "/catalog" } as const;

export interface PreviewTarget {
  /** An ISO code or "other". */
  country: string;
  language: Language;
  /** The site's address to open: the page in the language's own address ("/de", "/es/catalog", "/"). */
  path: string;
}

/**
 * What /admin/preview?country=DE&lang=de[&page=catalog] opens: a known country code (any ISO code;
 * one the site does not list shows what "other" gets) or "other", a site language, and one of PAGES.
 * Null for anything else.
 */
export function previewTarget(params: URLSearchParams): PreviewTarget | null {
  const raw = params.get("country")?.trim() ?? "";
  const country = raw.toLowerCase() === OTHER_COUNTRY ? OTHER_COUNTRY : raw.toUpperCase();
  const language = params.get("lang");
  const page = params.get("page") ?? "home";
  if (country !== OTHER_COUNTRY && !ISO_COUNTRY_CODES.includes(country)) return null;
  if (!isLanguage(language) || !(page in PAGES)) return null;
  return { country, language, path: localePath(language, PAGES[page as keyof typeof PAGES]) };
}

/**
 * GET /admin/preview: "Preview as a visitor" from the admin. Sets the site's country cookie exactly
 * as the footer's country picker does and sends the browser to the page in the asked language, which
 * then renders for that country (prices, catalog, examples, landing). It needs no admin session on
 * purpose: it does nothing a visitor cannot do with the picker (a link someone is tricked into opening
 * only changes which country their own browser shows, which they can switch back), it never reads or
 * changes anything on the server, it redirects only to our own pages built from checked values, and
 * it is kept out of caches and search engines.
 */
export function previewResponse(request: Request): Response {
  const url = new URL(request.url);
  const target = previewTarget(url.searchParams);
  const headers = new Headers({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" });
  if (!target) {
    headers.set("content-type", "text/plain; charset=utf-8");
    return new Response("Preview: ?country= (an ISO code or other) and ?lang= (en, es, de, ru, kk) are required", { status: 400, headers });
  }
  const https = url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  headers.append(
    "set-cookie",
    `${COUNTRY_COOKIE}=${encodeURIComponent(target.country)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${https ? "; Secure" : ""}`,
  );
  // A relative address: the browser stays on the host it asked (the site behind its proxy).
  headers.set("location", target.path);
  return new Response(null, { status: 303, headers });
}
