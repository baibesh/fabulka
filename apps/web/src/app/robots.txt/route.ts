import { localePath } from "@fabulka/shared";
import { UI_LOCALES } from "@/i18n/messages";
import { SITE_URL } from "@/lib/seo";
import { seoSettings } from "@/lib/seo-data";

/** A family's own pages (their books list, orders, ordering a print) in every language. */
const PRIVATE = ["/my", "/orders/", "/books/*/order"];

/**
 * robots.txt: the admin, the API, files and family pages are off limits, then the extra lines staff
 * add in the admin's SEO settings (checked there to be robots directives only), then the sitemap.
 * Cached with the SEO data: a settings save re-renders it.
 */
export async function GET() {
  const { robots } = await seoSettings();
  const disallow = ["/admin", "/api/", "/files/", ...UI_LOCALES.flatMap((locale) => PRIVATE.map((path) => localePath(locale, path)))];
  const lines = ["User-Agent: *", "Allow: /", ...disallow.map((path) => `Disallow: ${path}`), ""];
  if (robots.trim()) lines.push(robots.trim(), "");
  lines.push(`Sitemap: ${SITE_URL}/sitemap.xml`, "");
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
