import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { dropRedirects } from "@/lib/redirects";

/** Tags the API may expire (its SEO_TAG, REDIRECTS_TAG and EXAMPLES_TAG). */
const TAGS = new Set(["seo", "seo-redirects", "examples"]);

function sameSecret(given: string | null, secret: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /internal/revalidate { tags: ["seo"] } with x-revalidate-secret: REVALIDATE_SECRET. The API
 * calls it after an SEO publish or a settings/redirect change, and after a change in «Examples» or a
 * finished translation (the example books' pages and the sitemap), so the site re-renders those pages at
 * once (the data is expired outright: the next request renders fresh, never stale). Not reachable
 * from outside in production (nginx), and refused without the shared secret.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  if (!secret || !sameSecret(request.headers.get("x-revalidate-secret"), secret)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string" && TAGS.has(tag)) : [];
  if (!tags.length) return Response.json({ revalidated: false }, { status: 400 });
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  dropRedirects();
  return Response.json({ revalidated: true, tags });
}
