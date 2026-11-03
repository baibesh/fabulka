/**
 * The admin's working country lives in the address: `/admin/orders?country=DE`, `?country=all` for
 * "All countries". These helpers read the parameter, pick what to show when it is missing or not
 * allowed, and carry it onto admin links. No React here, so it is unit-tested on its own.
 */

/** The query parameter that holds the working country. */
export const COUNTRY_PARAM = "country";
/** Its value for "All countries" (global staff only). */
export const ALL = "all";

/** What the address asks for. */
export type CountryRequest =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "country"; code: string }
  /** Not a country code at all (`?country=germany`): kept to name it in the notice. */
  | { kind: "invalid"; raw: string };

/** `DE`, `de` and ` de ` ask for Germany; `all` (any case) for every country; empty or absent for nothing. */
export function parseCountryParam(raw: string | null | undefined): CountryRequest {
  const value = raw?.trim() ?? "";
  if (!value) return { kind: "none" };
  if (value.toLowerCase() === ALL) return { kind: "all" };
  if (/^[a-z]{2}$/i.test(value)) return { kind: "country", code: value.toUpperCase() };
  return { kind: "invalid", raw: value };
}

/** Which working countries the session may pick. */
export interface CountryScope {
  /** A manager's own countries, or every country the site offers for global staff. */
  options: readonly string[];
  /** "All countries" is offered (the superadmin, or staff without countries). */
  allowAll: boolean;
  /** The options are known (global staff wait for the offered countries to load). */
  loaded: boolean;
}

export interface ResolvedCountry {
  /** The country to work in; null for "All countries". */
  country: string | null;
  /** Its value in the address: a code or `all`. */
  param: string;
  /** What the address asked for and was refused (out of scope or malformed), to say so; else null. */
  refused: string | null;
  /** False while global staff's options load and a country code cannot be checked yet: use it, but do not rewrite the address. */
  settled: boolean;
}

function allows(request: CountryRequest, scope: CountryScope): boolean {
  if (request.kind === "all") return scope.allowAll;
  if (request.kind !== "country") return false;
  // Global staff may open any offered country; until the list loads the API is the judge.
  return scope.options.includes(request.code) || (scope.allowAll && !scope.loaded);
}

/** The value of an allowed request in the address. */
function paramOf(request: CountryRequest): string {
  return request.kind === "country" ? request.code : ALL;
}

/**
 * The working country for an address. An allowed `?country=` wins; without one, the remembered
 * choice (this tab's last, else this browser's) if still allowed, else the default: a manager's
 * first country, "All countries" for global staff. A refused one (a manager opening another
 * country's link, a country the site no longer offers, a malformed value) falls back the same way
 * and is reported in `refused`.
 */
export function resolveWorkingCountry(raw: string | null | undefined, scope: CountryScope, remembered?: string | null): ResolvedCountry {
  const request = parseCountryParam(raw);
  const pick = (chosen: CountryRequest, refused: string | null): ResolvedCountry => {
    const param = paramOf(chosen);
    const settled = !(chosen.kind === "country" && scope.allowAll && !scope.loaded && !scope.options.includes(chosen.code));
    return { country: param === ALL ? null : param, param, refused, settled };
  };
  if (allows(request, scope)) return pick(request, null);

  const memory = parseCountryParam(remembered);
  const fallback: CountryRequest = allows(memory, scope)
    ? memory
    : scope.allowAll || !scope.options.length
      ? { kind: "all" }
      : { kind: "country", code: scope.options[0] };
  if (request.kind === "none") return pick(fallback, null);
  const refused = request.kind === "invalid" ? request.raw : paramOf(request);
  return pick(fallback, refused);
}

/**
 * An admin link with the working country kept: `/admin/orders` → `/admin/orders?country=DE`. Other
 * query parameters and the hash stay; a null value leaves the link as it is.
 */
export function withCountry(href: string, param: string | null): string {
  if (!param) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const rest = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = rest.indexOf("?");
  const path = queryAt >= 0 ? rest.slice(0, queryAt) : rest;
  const query = new URLSearchParams(queryAt >= 0 ? rest.slice(queryAt + 1) : "");
  query.set(COUNTRY_PARAM, param);
  return `${path}?${query}${hash}`;
}
