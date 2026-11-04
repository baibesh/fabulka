"use client";

import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { Flag } from "@/components/ui/flag";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cx } from "@/components/ui/cx";
import { useCountryName } from "@/hooks/use-country-name";
import { ALL } from "@/lib/admin-country";
import { useNotOffered } from "./not-offered";
import { useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";

/** The workspace's mark: a globe for Global, else the country's flag. */
function Mark({ country }: { country: string | null }) {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
      {country ? <Flag code={country} className="text-base" /> : <Globe className="size-4" />}
    </span>
  );
}

/** The workspace's name: "Global" or the country's. */
export function useWorkspaceName(): (country: string | null) => string {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  return (country) => (country ? countryName(country) : t("admin.ws.global"));
}

/**
 * The top-left workspace switcher: "Fabulka · Global" or a country, like a team switcher. It lists
 * Global (for global staff) and the countries the session may work in (a manager's own, every offered
 * one for global staff). Staff whose sections do not depend on a country (SEO, illustrators) see
 * the name only.
 */
export function WorkspaceSwitcher() {
  const { t } = useAdminI18n();
  const name = useWorkspaceName();
  const notOffered = useNotOffered();
  const { country, options, allowAll, follows, setCountry } = useWorkingCountry();
  const value = country ?? ALL;
  const label = (
    <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Fabulka</span>
      <span className="truncate text-sm font-extrabold">{name(country)}</span>
    </span>
  );

  if (!follows || (!options.length && !allowAll)) {
    return (
      <div data-testid="workspace-switcher" data-value={value} data-loaded="true" className="flex items-center gap-2 rounded-xl px-2 py-1.5">
        <Mark country={country} />
        {label}
      </div>
    );
  }

  const pick = (next: string | null, close: () => void) => {
    close();
    if ((next ?? ALL) !== value) setCountry(next);
  };
  return (
    <Menu
      align="start"
      data-testid="workspace-menu"
      aria-label={t("admin.ws.switch")}
      className="max-h-[min(70vh,32rem)] w-72 overflow-y-auto"
      trigger={({ props }) => (
        <button
          type="button"
          {...props}
          data-testid="workspace-switcher"
          data-value={value}
          data-loaded={options.length > 0 ? "true" : "false"}
          aria-label={t("admin.ws.current", { workspace: name(country) })}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/10 focus-visible:bg-accent/10"
        >
          <Mark country={country} />
          {label}
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <>
          {allowAll && (
            <MenuItem data-testid="workspace-option-all" aria-current={value === ALL ? "true" : undefined} onClick={() => pick(null, close)}>
              <Mark country={null} />
              <span className="flex-1">{t("admin.ws.global")}</span>
              {value === ALL && <Check aria-hidden className="size-4 text-accent" />}
            </MenuItem>
          )}
          {options.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted">{t("admin.ws.countries")}</p>}
          {options.map((code) => (
            <MenuItem key={code} data-testid={`workspace-option-${code}`} aria-current={value === code ? "true" : undefined} onClick={() => pick(code, close)}>
              <Flag code={code} />
              <span className={cx("flex-1", notOffered(code) && "text-muted")}>
                {name(code)}
                {notOffered(code) && <span className="ml-1 text-[11px] text-warning">· {t("admin.country.notOffered")}</span>}
              </span>
              {value === code && <Check aria-hidden className="size-4 text-accent" />}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}
