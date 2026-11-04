"use client";

import { useQuery } from "@tanstack/react-query";
import { allowedFor, type AdminReference, type AdminRight } from "@fabulka/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { adminReference } from "@/lib/admin-api";
import type { MessageKey } from "@/i18n/messages";
import { PauseCard } from "./pause-card";
import { BlockedTab } from "./reference/blocked-tab";
import { AllCities } from "./reference/cities-tab";
import { CountriesTab } from "./reference/countries-tab";
import { DeliveryTab } from "./reference/delivery-tab";
import { FormatsTab } from "./reference/formats-tab";
import { FxTab } from "./reference/fx-tab";
import { PricesTab } from "./reference/prices-tab";
import { QUERY } from "./reference/shared";
import { CapsTab } from "./team/caps-tab";
import { useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";

/**
 * Global settings, a tab each: the countries the site offers (languages, currency, print), exchange
 * rates, blocked countries, the default prices and delivery fee (what a country without its own
 * pays), print format specs, every country's cities at a glance, the generation pause and the daily
 * caps on staff generation. Each tab needs its right everywhere; the API checks again.
 */
export const SETTINGS_TABS: readonly { id: string; label: MessageKey; right: AdminRight }[] = [
  { id: "countries", label: "admin.ws.settings.countries", right: "reference" },
  { id: "fx", label: "admin.reference.tab.fx", right: "reference" },
  { id: "blocked", label: "admin.reference.tab.blocked", right: "reference" },
  { id: "prices", label: "admin.ws.settings.prices", right: "reference" },
  { id: "delivery", label: "admin.ws.settings.delivery", right: "reference" },
  { id: "formats", label: "admin.ws.settings.formats", right: "reference" },
  { id: "cities", label: "admin.ws.settings.cities", right: "reference" },
  { id: "generation", label: "admin.ws.settings.generation", right: "dashboard" },
  { id: "caps", label: "admin.team.tab.caps", right: "team" },
];

/** /admin/settings?tab=…: the tab is in the address, so the Inbox and the palette link straight to one. */
export function SettingsPage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { access } = useWorkingCountry();
  const available = SETTINGS_TABS.filter((tab) => allowedFor(access, tab.right, null));
  const asked = params.get("tab");
  const tab = available.find((item) => item.id === asked)?.id ?? available[0]?.id;
  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <>
      <PageHeader size="sm" title={t("admin.ws.nav.settings")} lead={t("admin.ws.settings.lead")} />
      {tab && (
        <>
          <Tabs
            base={tabs}
            data-testid="settings-tabs"
            value={tab}
            onChange={pick}
            items={available.map(({ id, label }) => ({ id, label: t(label), testId: `settings-tab-${id}` }))}
          />
          <div {...tabPanelProps(tabs, tab)} data-testid={`settings-panel-${tab}`} className="flex flex-col gap-6 outline-none">
            <TabBody tab={tab} />
          </div>
        </>
      )}
    </>
  );
}

function TabBody({ tab }: { tab: string }) {
  const { t } = useAdminI18n();
  if (tab === "generation") return <PauseCard />;
  if (tab === "caps") return <CapsTab />;
  if (tab === "fx") return <FxTab />;
  return (
    <WithReference>
      {(data) => {
        switch (tab) {
          case "countries":
            return <CountriesTab initial={data.countries} blocked={data.blocked} prices={data.prices} />;
          case "blocked":
            return <BlockedTab initial={data.blocked} />;
          case "prices":
          case "delivery":
            return (
              <>
                <p data-testid="reference-scope" data-country="global" className="text-sm text-muted">
                  {t("admin.reference.scope.global")}
                </p>
                {tab === "prices" ? <PricesTab reference={data} country={null} /> : <DeliveryTab reference={data} country={null} />}
              </>
            );
          case "formats":
            return <FormatsTab initial={data.formats} />;
          default:
            return <AllCities reference={data} />;
        }
      }}
    </WithReference>
  );
}

function WithReference({ children }: { children: (data: AdminReference) => ReactNode }) {
  const reference = useQuery({ queryKey: QUERY, queryFn: adminReference });
  return reference.data ? <>{children(reference.data)}</> : <QueryState error={reference.error} scope="admin" />;
}
