"use client";

import { MapPin } from "lucide-react";
import { Flag } from "@/components/ui/flag";
import { buttonClass } from "@/components/ui/button";
import { useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";
import { useWorkspaceName } from "./workspace-switcher";

/**
 * A country's page opened in Global (an old link, a bookmark): it belongs to a country's workspace,
 * so it offers the countries to open it in.
 */
export function CountryRequired() {
  const { t } = useAdminI18n();
  const name = useWorkspaceName();
  const { options, setCountry } = useWorkingCountry();
  return (
    <div data-testid="country-required" className="flex max-w-2xl flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6">
      <MapPin aria-hidden className="size-6 text-accent" />
      <p className="font-bold">{t("admin.ws.countryRequired.title")}</p>
      <p className="text-sm text-muted">{t("admin.ws.countryRequired.text")}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((code) => (
          <button
            key={code}
            type="button"
            data-testid={`country-required-${code}`}
            onClick={() => setCountry(code)}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <Flag code={code} />
            {name(code)}
          </button>
        ))}
      </div>
    </div>
  );
}
