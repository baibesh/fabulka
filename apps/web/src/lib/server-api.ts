import { headers } from "next/headers";
import { cache } from "react";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * GET from the API while rendering on the server: parsed with the same schema the browser uses, so
 * the data handed to the client is what its own request would return. Undefined when the API is
 * slow, down or refuses (a visitor from a restricted country: their address travels along), and
 * the page then loads it in the browser as before. Asked once per request (several parts of a page
 * want the reference data).
 */
export const serverGet = cache(async function serverGet<T>(path: string, schema: { parse(value: unknown): T }): Promise<T | undefined> {
  try {
    const realIp = (await headers()).get("x-real-ip");
    const response = await fetch(`${API_URL}${path}`, {
      headers: { accept: "application/json", ...(realIp ? { "x-real-ip": realIp } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return undefined;
    return schema.parse(await response.json());
  } catch {
    return undefined;
  }
});

/**
 * The same for build-time and metadata use, where there is no visitor: no headers read, so it can
 * run anywhere (the sitemap).
 */
export async function publicGet<T>(path: string, schema: { parse(value: unknown): T }): Promise<T | undefined> {
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    return schema.parse(await response.json());
  } catch {
    return undefined;
  }
}
