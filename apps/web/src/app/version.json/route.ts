import { connection } from "next/server";

/**
 * GET /version.json: the build the server runs (NEXT_PUBLIC_BUILD_ID, next.config.ts). Open pages
 * compare it with the build they were loaded from and offer a reload when it differs
 * (components/layout/new-version.tsx). Answered per request and never cached.
 */
export async function GET() {
  await connection();
  return Response.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null }, { headers: { "Cache-Control": "no-store" } });
}
