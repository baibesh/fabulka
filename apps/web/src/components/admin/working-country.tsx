"use client";

import { useQuery } from "@tanstack/react-query";
import { accessFromMe, type AdminAccess, type AdminMe, type AdminRight } from "@fabulka/shared";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { adminReference } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { Select } from "@/components/ui/input";
import { QUERY as REFERENCE_QUERY } from "./reference/shared";
import { useAdminI18n } from "./ui";

/** Where the working country is remembered, per browser. */
const STORAGE_KEY = "fabulka.admin.country";
/** The switcher's value for "All countries". */
const ALL = "all";

/** The rights whose lists follow the working country. */
const COUNTRY_RIGHTS: readonly AdminRight[] = ["orders", "examples", "catalog", "reference", "reference.prices", "reference.landing"];

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
  setCountry: (country: string | null) => void;
}

const Context = createContext<WorkingCountry | null>(null);

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
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/**
 * The admin's working country: a manager picks among their countries (the first by default), global
 * staff among "All countries" and every country the site offers. Lists of orders, examples, catalog
 * visibility, samples, prices and landing data follow it; the choice is kept in this browser.
 */
export function WorkingCountryProvider({ me, children }: { me: AdminMe; children: ReactNode }) {
  const allowAll = me.superadmin || me.countries.length === 0;
  const access = useMemo(() => accessFromMe(me), [me]);
  // Every country the site offers, for global staff (a manager's own list comes from /admin/me).
  const reference = useQuery({
    queryKey: REFERENCE_QUERY,
    queryFn: adminReference,
    enabled: allowAll && me.rights.some((right) => COUNTRY_RIGHTS.includes(right)),
  });
  const options = useMemo(() => {
    if (!allowAll) return me.countries;
    const blocked = new Set([...(reference.data?.blocked.meta.map((c) => c.code) ?? []), ...(reference.data?.blocked.extra ?? [])]);
    return reference.data?.countries.map((c) => c.code).filter((code) => !blocked.has(code)) ?? [];
  }, [allowAll, me.countries, reference.data]);
  // Read once hydrated (the server render knows nothing of this browser); a pick replaces it.
  const hydrated = useHydrated();
  const [picked, setStored] = useState<string | null>(null);
  const stored = picked ?? (hydrated ? readStored() : null);

  const country = stored && options.includes(stored) ? stored : stored === ALL && allowAll ? null : allowAll ? null : (options[0] ?? null);
  const value: WorkingCountry = {
    country,
    options,
    allowAll,
    access,
    me,
    setCountry: (next) => {
      const v = next ?? ALL;
      store(v);
      setStored(v);
    },
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
  const { country, options, allowAll, me, setCountry } = useWorkingCountry();
  if (!me.rights.some((right) => COUNTRY_RIGHTS.includes(right))) return null;
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
