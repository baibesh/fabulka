import { DEFAULT_LANGUAGE, isLanguage, localePath, splitLocalePath } from "@fabulka/shared";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Language in the address. Russian, the default, has none: /catalog is served by the /ru/catalog
 * route (a rewrite, invisible to the visitor), and /ru/catalog itself redirects (308) to /catalog,
 * so each page has one address per language. /kk, /en, /es and /de are routes of their own. Old
 * links with ?lang=xx redirect to that language's address. Nobody is redirected by Accept-Language
 * or a cookie: the address alone decides the language, for visitors and search engines alike.
 * Anything else in the first segment (/fr/…) is just a path under the Russian site, so it is a 404.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
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
  // next.config.ts), Next's own files, or anything with a file extension (covers, robots.txt,
  // sitemap.xml, the icon).
  matcher: ["/((?!admin|api|files|_next|.*\\..*).*)"],
};
