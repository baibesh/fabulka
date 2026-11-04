"use client";

import { useQuery } from "@tanstack/react-query";
import { LANGUAGE_NAMES, countryInfo, inLanguageOrder, type AdminReference, type AdminRight } from "@fabulka/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/ui/flag";
import { QueryState } from "@/components/ui/query-state";
import { PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { useCountryName } from "@/hooks/use-country-name";
import { adminReference } from "@/lib/admin-api";
import type { MessageKey } from "@/i18n/messages";
import { CountryRequired } from "../country-required";
import { Card, useAdminI18n } from "../ui";
import { useWorkingCountry } from "../working-country";
import { CitiesTab } from "./cities-tab";
import { CountryFormatsTab } from "./country-formats-tab";
import { DeliveryTab } from "./delivery-tab";
import { FaqTab } from "./faq-tab";
import { LandingTab } from "./landing-tab";
import { PricesTab } from "./prices-tab";
import { QUERY } from "./shared";

/** Reference data (GET /admin/reference) for a page, its loading or error state until then. */
function WithReference({ children }: { children: (data: AdminReference) => ReactNode }) {
  const reference = useQuery({ queryKey: QUERY, queryFn: adminReference });
  return reference.data ? <>{children(reference.data)}</> : <QueryState error={reference.error} scope="admin" />;
}

/**
 * A page of a country's workspace that edits that country's reference data (its landing, prices
 * and delivery, print formats, cities): the country's card, then the form, keyed by the country so a
 * switch starts the form over from that country's saved data. In Global it asks for a country.
 */
function CountryReferencePage({ title, lead, children }: { title: MessageKey; lead: MessageKey; children: (data: AdminReference, country: string) => ReactNode }) {
  const { t } = useAdminI18n();
  const { country } = useWorkingCountry();
  return (
    <>
      <PageHeader size="sm" title={t(title)} lead={t(lead)} />
      {!country ? (
        <CountryRequired />
      ) : (
        <WithReference>
          {(data) => (
            <>
              <ScopeLine country={country} reference={data} />
              <div key={country} className="flex flex-col gap-6">
                {children(data, country)}
              </div>
            </>
          )}
        </WithReference>
      )}
    </>
  );
}

/** /admin/landing: the country's landing (hero texts and pictures, its FAQ picks). */
export function LandingPage() {
  return (
    <CountryReferencePage title="admin.ws.nav.landing" lead="admin.ws.landing.lead">
      {(data, country) => <LandingTab reference={data} country={country} />}
    </CountryReferencePage>
  );
}

/** /admin/prices: the country's book prices and its delivery fee, a tab each (as the rights allow). */
export function PricesPage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const { me } = useWorkingCountry();
  const available = (["prices", "delivery"] as const).filter((id) => me.rights.includes(id === "prices" ? "reference.prices" : "reference.delivery") || me.rights.includes("reference"));
  const [picked, setPicked] = useState<(typeof available)[number]>(available[0] ?? "prices");
  const tab = available.includes(picked) ? picked : available[0];
  return (
    <CountryReferencePage title="admin.ws.nav.prices" lead="admin.ws.prices.lead">
      {(data, country) => (
        <>
          {available.length > 1 && (
            <Tabs
              base={tabs}
              data-testid="reference-tabs"
              value={tab}
              onChange={setPicked}
              items={available.map((id) => ({ id, label: t(`admin.reference.tab.${id}`), testId: `reference-tab-${id}` }))}
            />
          )}
          <div {...tabPanelProps(tabs, tab)} className="outline-none">
            {tab === "prices" ? <PricesTab reference={data} country={country} /> : <DeliveryTab reference={data} country={country} />}
          </div>
        </>
      )}
    </CountryReferencePage>
  );
}

/** /admin/print-formats: which print formats the country offers, and at what price. */
export function PrintFormatsPage() {
  return (
    <CountryReferencePage title="admin.ws.nav.printFormats" lead="admin.ws.printFormats.lead">
      {(data, country) => <CountryFormatsTab reference={data} country={country} />}
    </CountryReferencePage>
  );
}

/** /admin/cities: the country's delivery cities. */
export function CitiesPage() {
  return (
    <CountryReferencePage title="admin.ws.nav.cities" lead="admin.ws.cities.lead">
      {(data, country) => <CitiesTab reference={data} country={country} />}
    </CountryReferencePage>
  );
}

/** /admin/faq: the shared questions every landing picks from (global staff). */
export function FaqPage() {
  const { t } = useAdminI18n();
  return (
    <>
      <PageHeader size="sm" title={t("admin.ws.nav.faq")} lead={t("admin.ws.faq.lead")} />
      <WithReference>{(data) => <FaqTab initial={data.faq} countries={data.countries} />}</WithReference>
    </>
  );
}

/** The per-country pages Reference data's tabs became, with the right each needs. */
const COUNTRY_PAGES: { href: string; right: AdminRight }[] = [
  { href: "/admin/prices", right: "reference.prices" },
  { href: "/admin/prices", right: "reference.delivery" },
  { href: "/admin/print-formats", right: "reference.formats_country" },
  { href: "/admin/cities", right: "reference.cities" },
  { href: "/admin/landing", right: "reference.landing" },
];

/**
 * /admin/reference, the old Reference data page: its tabs moved to the country workspace (prices and
 * delivery, print formats, cities, landing) and to Global (Settings, FAQ). An old link lands on the
 * first of them the session opens: a country's prices with a country in the address, else Settings.
 */
export function ReferenceRedirect() {
  const router = useRouter();
  const { t } = useAdminI18n();
  const { country, me, href } = useWorkingCountry();
  const full = me.rights.includes("reference");
  const page = COUNTRY_PAGES.find(({ right }) => full || me.rights.includes(right))?.href;
  const target = country ? (page ?? "/admin") : full ? "/admin/settings" : (page ?? "/admin");
  useEffect(() => {
    router.replace(href(target));
  }, [router, href, target]);
  return (
    <p data-testid="reference-moved" className="text-muted">
      {t("admin.loading")}
    </p>
  );
}

/** Whose data a per-country page edits, and (read-only) what the site offers there. */
function ScopeLine({ country, reference }: { country: string; reference: AdminReference }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const entry = reference.countries.find((c) => c.code === country);
  const info = countryInfo(country, reference.countries);
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
