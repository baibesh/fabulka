"use client";

import { useQuery } from "@tanstack/react-query";
import { accessFromMe, type AdminAccess, type AdminMe, type AdminRight } from "@fabulka/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminReference } from "@/lib/admin-api";
import { ALL, COUNTRY_PARAM, resolveWorkingCountry, withCountry } from "@/lib/admin-country";
import { useCountryName } from "@/hooks/use-country-name";
import { Select } from "@/components/ui/input";
import { QUERY as REFERENCE_QUERY } from "./reference/shared";
import { useAdminI18n } from "./ui";

/** Where this browser remembers the last pick: only the default for a visit whose address has no country. */
const STORAGE_KEY = "fabulka.admin.country";

/** The rights whose lists follow the working country. */
const COUNTRY_RIGHTS: readonly AdminRight[] = ["orders", "examples", "catalog", "reference", "reference.prices", "reference.landing", "audit", "dashboard"];

/** A country in the address the session may not open, and what is shown instead. */
interface Refusal {
  requested: string;
  shown: string;
}

export interface WorkingCountry {
  /** The country the admin works in now; null for "All countries" (only offered to global staff). */
  country: string | null;
  /** The countries the switcher offers: a manager's own, or every offered one for global staff. */
  options: string[];
  /** The switcher offers "All countries": the superadmin, or staff without countries. */
  allowAll: boolean;
  /** What the session may do (allowedFor in the browser; the API checks again). */
  access: AdminAccess;
  me: AdminMe;
  /** The admin's sections follow a working country (the switcher is shown). */
  follows: boolean;
  setCountry: (country: string | null) => void;
  /** An admin link that keeps the working country: `/admin/orders` → `/admin/orders?country=DE`. */
  href: (path: string) => string;
  /** The address asked for a country the session may not open; shown until dismissed or switched. */
  refusal: Refusal | null;
  dismissRefusal: () => void;
}

const Context = createContext<WorkingCountry | null>(null);

/** This tab's last working country: a link that lost the parameter lands on it, not on another tab's. */
let lastInTab: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode or blocked storage: a fresh visit starts on the default.
  }
}

/**
 * The admin's working country, kept in the address (`?country=DE`, `?country=all`): a manager picks
 * among their countries (the first by default), global staff among "All countries" (the default)
 * and every country the site offers. Lists of orders, examples, catalog visibility, samples,
 * prices, landing data, activity and the dashboards follow it. The address always wins; an address
 * without a country gets this tab's last one, else this browser's last pick, else the default, and
 * one the session may not open falls back the same way with a notice.
 *
 * History: a pick in the switcher pushes an entry (Back returns to the country before it); filling
 * in or correcting the parameter replaces the entry, so Back never lands on an address that would
 * be rewritten again. Both go through the History API, which Next's router follows: the page is not
 * fetched again and keeps its state (filters, the open tab); only what reads the country changes.
 */
export function WorkingCountryProvider({ me, children }: { me: AdminMe; children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const allowAll = me.superadmin || me.countries.length === 0;
  const follows = me.rights.some((right) => COUNTRY_RIGHTS.includes(right));
  const access = useMemo(() => accessFromMe(me), [me]);
  // Every country the site offers, for global staff (a manager's own list comes from /admin/me).
  const reference = useQuery({ queryKey: REFERENCE_QUERY, queryFn: adminReference, enabled: allowAll && follows });
  const options = useMemo(() => {
    if (!allowAll) return me.countries;
    const blocked = new Set([...(reference.data?.blocked.meta.map((c) => c.code) ?? []), ...(reference.data?.blocked.extra ?? [])]);
    return reference.data?.countries.map((c) => c.code).filter((code) => !blocked.has(code)) ?? [];
  }, [allowAll, me.countries, reference.data]);
  const loaded = !allowAll || reference.data !== undefined;

  // The server render knows nothing of this browser: the remembered pick is read once hydrated.
  const hydrated = useHydrated();
  const raw = params.get(COUNTRY_PARAM);
  const resolved = resolveWorkingCountry(raw, { options, allowAll, loaded }, lastInTab ?? (hydrated ? readStored() : null));
  const current = `${pathname}${params.size ? `?${params}` : ""}`;

  // A refused address is reported once per refusal and kept while that fallback is shown.
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  if (follows && resolved.settled && resolved.refused && (refusal?.requested !== resolved.refused || refusal.shown !== resolved.param)) {
    setRefusal({ requested: resolved.refused, shown: resolved.param });
  }

  // Fill in or correct the address; remember what this tab works in.
  const target = follows && resolved.settled && raw !== resolved.param ? withCountry(current, resolved.param) : null;
  useEffect(() => {
    if (target) window.history.replaceState(null, "", target);
  }, [target]);
  useEffect(() => {
    if (follows && resolved.settled) lastInTab = resolved.param;
  }, [follows, resolved.settled, resolved.param]);

  const param = follows ? resolved.param : null;
  const value: WorkingCountry = {
    country: follows ? resolved.country : allowAll ? null : (options[0] ?? null),
    options,
    allowAll,
    access,
    me,
    follows,
    setCountry: (next) => {
      const v = next ?? ALL;
      store(v);
      lastInTab = v;
      setRefusal(null);
      window.history.pushState(null, "", withCountry(current, v));
    },
    href: (path) => withCountry(path, param),
    refusal: refusal && refusal.shown === param ? refusal : null,
    dismissRefusal: () => setRefusal(null),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The working country and the session's access; only inside the admin frame. */
export function useWorkingCountry(): WorkingCountry {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkingCountry outside WorkingCountryProvider");
  return value;
}

/** The header's switcher; hidden for staff whose sections do not depend on a country. */
export function WorkingCountrySwitcher({ className }: { className?: string }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { country, options, allowAll, follows, setCountry } = useWorkingCountry();
  if (!follows) return null;
  if (!options.length && !allowAll) return null;
  return (
    <Select
      data-testid="admin-country"
      data-value={country ?? ALL}
      data-loaded={options.length > 0 ? "true" : "false"}
      aria-label={t("admin.country.label")}
      className={className}
      value={country ?? ALL}
      onChange={(e) => setCountry(e.target.value === ALL ? null : e.target.value)}
    >
      {allowAll && <option value={ALL}>{t("admin.country.all")}</option>}
      {options.map((code) => (
        <option key={code} value={code}>
          {countryName(code)}
        </option>
      ))}
    </Select>
  );
}

/** The address asked for a country the session may not open: what was asked, and what is shown. */
export function WorkingCountryNotice() {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { refusal, dismissRefusal } = useWorkingCountry();
  if (!refusal) return null;
  const name = (value: string) => (value === ALL ? t("admin.country.all") : /^[A-Z]{2}$/.test(value) ? countryName(value) : value);
  return (
    <div
      role="status"
      data-testid="admin-country-notice"
      data-requested={refusal.requested}
      data-shown={refusal.shown}
      className="flex items-start justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <span>{t("admin.country.refused", { requested: name(refusal.requested), shown: name(refusal.shown) })}</span>
      <button type="button" data-testid="admin-country-notice-close" aria-label={t("admin.close")} onClick={dismissRefusal} className="text-muted hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Keeps the working country on an admin link or navigation: `/admin/books/1` → `/admin/books/1?country=DE`. */
export function useAdminHref(): (path: string) => string {
  return useWorkingCountry().href;
}
