import { DEFAULT_LANGUAGE, isLanguage, localePath, splitLocalePath } from "@fabulka/shared";
import { NextResponse, type NextRequest } from "next/server";
import { redirectFor } from "./lib/redirects";

/**
 * Language in the address. The default language (DEFAULT_LANGUAGE, English) has none: /catalog is
 * served by the /en/catalog route (a rewrite, invisible to the visitor), and /en/catalog itself
 * redirects (308) to /catalog, so each page has one address per language. /ru, /kk, /es and /de are
 * routes of their own. Old links with ?lang=xx redirect to that language's address. Nobody is
 * redirected by Accept-Language or a cookie: the address alone decides the language, for visitors
 * and search engines alike (the default language's pages only offer another one, LocaleSuggestion).
 * Anything else in the first segment (/fr/…) is just a path under the default language's site, so
 * it is a 404. Before all that, the redirects staff set up in the admin's SEO section (kept for a
 * minute).
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const custom = await redirectFor(pathname);
  if (custom) {
    // A path keeps the request's query; an absolute URL is taken as written.
    const url = custom.to.startsWith("/") ? new URL(custom.to, request.nextUrl) : new URL(custom.to);
    if (custom.to.startsWith("/") && !custom.to.includes("?")) url.search = request.nextUrl.search;
    return NextResponse.redirect(url, custom.status);
  }
  const { language, path, prefixed } = splitLocalePath(pathname);

  const asked = searchParams.get("lang");
  if (asked !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("lang");
    url.pathname = localePath(isLanguage(asked) ? asked : language, path);
    return NextResponse.redirect(url, 308);
  }

  if (language === DEFAULT_LANGUAGE && prefixed) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url, 308);
  }

  if (prefixed) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LANGUAGE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // The site's pages only: not the admin, the API and generated files (proxied to the API in
  // next.config.ts), Next's own files, the API's revalidation route, or anything with a file
  // extension (covers, robots.txt, sitemap.xml, the icon, the IndexNow key).
  matcher: ["/((?!admin|api|files|_next|internal/|.*\\..*).*)"],
};
