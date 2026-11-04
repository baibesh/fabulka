"use client";

import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_NAMES, countryInfo, inLanguageOrder, type AdminReference, type AdminRight } from "@fabulka/shared";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/ui/flag";
import { QueryState } from "@/components/ui/query-state";
import { PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { useCountryName } from "@/hooks/use-country-name";
import { adminReference } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { useWorkingCountry } from "../working-country";
import { BlockedTab } from "./blocked-tab";
import { AllCities, CitiesTab } from "./cities-tab";
import { CountriesTab } from "./countries-tab";
import { CountryFormatsTab } from "./country-formats-tab";
import { DeliveryTab } from "./delivery-tab";
import { FaqTab } from "./faq-tab";
import { FormatsTab } from "./formats-tab";
import { FxTab } from "./fx-tab";
import { LandingTab } from "./landing-tab";
import { PricesTab } from "./prices-tab";
import { QUERY } from "./shared";

const TABS = ["prices", "delivery", "formats", "cities", "landing", "faq", "countries", "fx", "blocked"] as const;
type Tab = (typeof TABS)[number];

/**
 * The part of Reference each per-country tab needs; the global tabs (the shared FAQ, the countries
 * list, blocked countries) need the whole section.
 */
const TAB_RIGHT: Record<Tab, AdminRight> = {
  prices: "reference.prices",
  delivery: "reference.delivery",
  formats: "reference.formats_country",
  cities: "reference.cities",
  landing: "reference.landing",
  faq: "reference",
  countries: "reference",
  fx: "reference",
  blocked: "reference",
};

/**
 * /admin/reference. Per-country data (prices, delivery, print formats' offer and prices, cities,
 * the landing with its FAQ) follows the working-country switcher: the superadmin edits the global
 * defaults ("All countries") or one country's own; a country manager only their selected country's.
 * Global data - the countries list, blocked countries, format specs, the shared FAQ and the global
 * defaults - is the superadmin's alone.
 */
export function ReferencePage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const { me, country } = useWorkingCountry();
  const full = me.rights.includes("reference");
  const available = TABS.filter((tab) => me.rights.includes(TAB_RIGHT[tab]) || full);
  const [picked, setTab] = useState<Tab>(available[0] ?? "prices");
  const tab = available.includes(picked) ? picked : available[0];
  const reference = useQuery({ queryKey: QUERY, queryFn: adminReference });
  const data = reference.data;
  const perCountry = TAB_RIGHT[tab] !== "reference";

  return (
    <>
      <PageHeader size="sm" title={t("admin.reference.title")} lead={full ? t("admin.reference.lead") : t("admin.reference.lead.scoped")} />
      <Tabs
        base={tabs}
        data-testid="reference-tabs"
        value={tab}
        onChange={setTab}
        items={available.map((id) => ({ id, label: t(`admin.reference.tab.${id}`), testId: `reference-tab-${id}` }))}
      />
      {perCountry && <ScopeLine country={country} reference={data} />}
      <div {...tabPanelProps(tabs, tab)} className="outline-none">
        {!data ? (
          <QueryState error={reference.error} scope="admin" />
        ) : (
          <TabBody tab={tab} data={data} country={country} />
        )}
      </div>
    </>
  );
}

function TabBody({ tab, data, country }: { tab: Tab; data: AdminReference; country: string | null }) {
  // Keyed by the country: switching it starts the forms over from that country's saved data.
  const key = country ?? "global";
  switch (tab) {
    case "prices":
      return <PricesTab key={key} reference={data} country={country} />;
    case "delivery":
      return <DeliveryTab key={key} reference={data} country={country} />;
    case "formats":
      return country ? <CountryFormatsTab key={key} reference={data} country={country} /> : <FormatsTab initial={data.formats} />;
    case "cities":
      return country ? <CitiesTab key={key} reference={data} country={country} /> : <AllCities reference={data} />;
    case "landing":
      return country ? <LandingTab key={key} reference={data} country={country} /> : <PickCountry />;
    case "faq":
      return <FaqTab initial={data.faq} countries={data.countries} />;
    case "countries":
      return <CountriesTab initial={data.countries} blocked={data.blocked} prices={data.prices} />;
    case "fx":
      return <FxTab />;
    default:
      return <BlockedTab initial={data.blocked} />;
  }
}

/** Whose data a per-country tab edits, and (read-only) what the site offers there. */
function ScopeLine({ country, reference }: { country: string | null; reference: AdminReference | undefined }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  if (!country) {
    return (
      <p data-testid="reference-scope" data-country="global" className="text-sm text-muted">
        {t("admin.reference.scope.global")}
      </p>
    );
  }
  const entry = reference?.countries.find((c) => c.code === country);
  const info = countryInfo(country, reference?.countries ?? []);
  return (
    <Card data-testid="reference-scope" data-country={country} className="gap-2">
      <p className="flex items-center gap-2 font-bold">
        <Flag code={country} />
        {t("admin.reference.scope.country", { country: countryName(country) })}
      </p>
      {entry && (
        <p data-testid="reference-country-entry" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("admin.reference.scope.languages", { languages: inLanguageOrder(info.languages).map((l) => LANGUAGE_NAMES[l]).join(", ") })}
          <Badge tone="neutral">{info.currency}</Badge>
          <Badge tone={info.print ? "success" : "neutral"}>{info.print ? t("admin.reference.scope.print") : t("admin.reference.scope.noPrint")}</Badge>
          <span className="text-xs">{t("admin.reference.scope.readonly")}</span>
        </p>
      )}
    </Card>
  );
}

/** A per-country tab with no global default (the landing): pick a country in the switcher. */
function PickCountry() {
  const { t } = useAdminI18n();
  return (
    <p data-testid="reference-pick-country" className="text-muted">
      {t("admin.reference.scope.pick")}
    </p>
  );
}
