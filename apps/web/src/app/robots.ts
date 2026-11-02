import type { MetadataRoute } from "next";
import { UI_LOCALES } from "@/i18n/messages";
import { SITE_URL } from "@/lib/seo";
import { localePath } from "@fabulka/shared";

/** A family's own pages (their books list, orders, ordering a print) in every language. */
const PRIVATE = ["/my", "/orders/", "/books/*/order"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/files/", ...UI_LOCALES.flatMap((locale) => PRIVATE.map((path) => localePath(locale, path)))],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
