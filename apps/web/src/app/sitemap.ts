import { localePath } from "@fabulka/shared";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { UI_LOCALES } from "@/i18n/messages";
import { SITE_URL, languageVersions } from "@/lib/seo";
import { sitemapEntries } from "@/lib/sitemap-data";

/** The site's public pages that are always there. */
const PAGES = ["/", "/catalog", "/create", "/privacy", "/terms"];

/**
 * Every public page in every language, each with its hreflang alternates (the five languages and
 * x-default): the fixed pages, the published catalog books and the example books staff picked.
 * Built on request, so a book added in the admin is listed without a rebuild.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const { templates, examples } = await sitemapEntries();
  const paths: { path: string; lastModified?: string }[] = [
    ...PAGES.map((path) => ({ path })),
    ...templates.map((t) => ({ path: `/catalog/${t.slug}`, lastModified: t.updatedAt })),
    ...examples.map((b) => ({ path: `/books/${b.id}`, lastModified: b.updatedAt })),
  ];
  const absolute = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);
  return paths.flatMap(({ path, lastModified }) => {
    const languages = Object.fromEntries(Object.entries(languageVersions(path)).map(([lang, href]) => [lang, absolute(href)]));
    return UI_LOCALES.map((locale) => ({
      url: absolute(localePath(locale, path)),
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    }));
  });
}
