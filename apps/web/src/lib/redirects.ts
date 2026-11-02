import { PublicRedirectSchema, findRedirect, type PublicRedirect } from "@fabulka/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
/** How long the proxy keeps the redirects before asking the API again. */
export const REDIRECTS_TTL_MS = 60_000;

interface Cache {
  at: number;
  list: Promise<PublicRedirect[]>;
}

// On globalThis: the proxy and the revalidation route are bundled apart but run in one process,
// and the route must be able to drop what the proxy keeps.
const KEY = Symbol.for("fabulka.redirects");
const store = globalThis as unknown as Record<symbol, Cache | null | undefined>;

async function load(): Promise<PublicRedirect[]> {
  try {
    const response = await fetch(`${API_URL}/api/seo/redirects`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(2000) });
    if (!response.ok) return [];
    return PublicRedirectSchema.array().parse(await response.json());
  } catch {
    return [];
  }
}

/** The active redirects staff set up in the admin, kept for a minute (dropped at once on a change). */
export function redirects(now = Date.now()): Promise<PublicRedirect[]> {
  const cached = store[KEY];
  if (cached && now - cached.at < REDIRECTS_TTL_MS) return cached.list;
  const list = load();
  store[KEY] = { at: now, list };
  return list;
}

/** Forgets the kept redirects: the next request asks the API again. */
export function dropRedirects() {
  store[KEY] = null;
}

/** The redirect for this path, if any. */
export async function redirectFor(pathname: string): Promise<PublicRedirect | undefined> {
  return findRedirect(await redirects(), pathname);
}
