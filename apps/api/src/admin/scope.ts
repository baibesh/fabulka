import { ForbiddenException } from '@nestjs/common';
import {
  SCOPE_FORBIDDEN,
  allowedFor,
  covers,
  isSuperAdmin,
  scopeOf,
  type AdminAccess,
  type AdminRight,
} from '@fabulka/shared';

// ---- Country scope on admin routes ----------------------------------------------------------------
//
// The guard lets a session into a section when it holds the right in some scope; these helpers then
// narrow each route to the session's countries. A superadmin and a global right are never narrowed;
// a country-scoped right reaches only things whose every country is the session's, and lists show
// only what touches the session's countries. Things with no country (shared, global, "everywhere"
// or "everywhere except…") are global staff's alone.

/** A 403 with SCOPE_FORBIDDEN: the thing is not within the session's countries. */
export function outOfScope(message: string): ForbiddenException {
  return new ForbiddenException({ code: SCOPE_FORBIDDEN, message });
}

/** Refuses (403 scope_forbidden) unless allowedFor(session, right, countries). */
export function assertScope(
  session: AdminAccess,
  right: AdminRight,
  countries: readonly string[] | null | undefined,
  message: string,
): void {
  if (!allowedFor(session, right, countries)) throw outOfScope(message);
}

/**
 * The countries a session's list is limited to for any of `rights`: null when one of them holds
 * everywhere (or the session is the superadmin), else the session's countries.
 */
export function listScope(
  session: AdminAccess,
  ...rights: AdminRight[]
): string[] | null {
  if (isSuperAdmin(session)) return null;
  if (rights.some((right) => covers(session.global, right))) return null;
  return rights.some((right) => scopeOf(session, right)?.length)
    ? [...session.countries]
    : [];
}

/**
 * The countries a list shows: the session's scope narrowed to the working country the admin picked
 * (?country=), or the whole scope without one. A working country outside the scope narrows to
 * nothing.
 */
export function listCountries(
  scope: string[] | null,
  working: string | null | undefined,
): string[] | null {
  const country = working?.trim().toUpperCase() || null;
  if (!country) return scope;
  if (scope && !scope.includes(country)) return [];
  return [country];
}
