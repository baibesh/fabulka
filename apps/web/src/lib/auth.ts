"use client";

import { useQuery } from "@/lib/query";
import { AuthLogoutSchema, AuthMeSchema, localePath, type AuthMe } from "@fabulka/shared";
import type { UiLocale } from "@/i18n/messages";
import { clientKey, request } from "./api";

const SIGNED_OUT: AuthMe = { enabled: false, user: null };

/** Whether sign-in is on and who is signed in. An unreachable API counts as sign-in being off. */
async function getMe(): Promise<AuthMe> {
  try {
    return AuthMeSchema.parse(await request("/api/auth/me"));
  } catch {
    return SIGNED_OUT;
  }
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });
}

/**
 * The sign-in address. The anonymous key travels along (a redirect carries no x-client-key), so the
 * books made in this browser move to the account; `returnTo` is the site path to come back to, in
 * the page's language (`/my` on an English page comes back to /en/my). Keycloak's pages open in
 * that language too (ui_locales).
 */
export function loginUrl(returnTo: string, locale: UiLocale): string {
  const query = new URLSearchParams({ return: localePath(locale, returnTo), key: clientKey(), lang: locale });
  return `/api/auth/login?${query}`;
}

/**
 * Ends the session here and at Keycloak, then comes back to `returnTo` (a site path, put in the
 * page's language; the home page by default): the API answers with the address to go to.
 */
export async function logout(returnTo = "/", locale: UiLocale = "ru") {
  const body = JSON.stringify({ return: localePath(locale, returnTo) });
  const { url } = AuthLogoutSchema.parse(await request("/api/auth/logout", { method: "POST", body }));
  window.location.href = url;
}
