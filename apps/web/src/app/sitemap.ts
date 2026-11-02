import { localePath } from "@fabulka/shared";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { UI_LOCALES } from "@/i18n/messages";
import { SITE_URL, languageVersions } from "@/lib/seo";
import { publicPages, seoPages, seoSettings } from "@/lib/seo-data";

/** The site's public pages that are always there, by their SEO key. */
const PAGES: { key: string; path: string }[] = [
  { key: "home", path: "/" },
  { key: "catalog", path: "/catalog" },
  { key: "create", path: "/create" },
  { key: "privacy", path: "/privacy" },
  { key: "terms", path: "/terms" },
];

/**
 * Every public page in every language, each with its hreflang alternates (the five languages and
 * x-default): the fixed pages, the published catalog books and the example books staff picked
 * (unless the SEO settings leave them out). A language version staff set to noindex is left out.
 * Built on request, so a book added in the admin is listed without a rebuild.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [{ templates, examples }, settings, ...seo] = await Promise.all([publicPages(), seoSettings(), ...UI_LOCALES.map((l) => seoPages(l))]);
  const noindex = (key: string, index: number) => seo[index][key]?.noindex === true;
  const pages: { key: string; path: string; lastModified?: string }[] = [
    ...PAGES,
    ...templates.map((t) => ({ key: `template:${t.slug}`, path: `/catalog/${t.slug}`, lastModified: t.updatedAt })),
    ...(settings.sitemapExamples ? examples.map((b) => ({ key: `book:${b.id}`, path: `/books/${b.id}`, lastModified: b.updatedAt })) : []),
  ];
  const absolute = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);
  return pages.flatMap(({ key, path, lastModified }) => {
    const languages = Object.fromEntries(Object.entries(languageVersions(path)).map(([lang, href]) => [lang, absolute(href)]));
    return UI_LOCALES.flatMap((locale, index) =>
      noindex(key, index)
        ? []
        : [
            {
              url: absolute(localePath(locale, path)),
              ...(lastModified ? { lastModified } : {}),
              alternates: { languages },
            },
          ],
    );
  });
}
