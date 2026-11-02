import { SitemapEntriesSchema, type SitemapEntries } from "@fabulka/shared";
import { publicGet } from "./server-api";

/**
 * What the sitemap lists besides the fixed pages: the published catalog books and the example books
 * staff picked (GET /api/sitemap); empty when the API cannot be reached.
 */
export async function sitemapEntries(): Promise<SitemapEntries> {
  return (await publicGet("/api/sitemap", SitemapEntriesSchema)) ?? { templates: [], examples: [] };
}
