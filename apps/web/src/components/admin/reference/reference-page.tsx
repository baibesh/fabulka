"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryState } from "@/components/ui/query-state";
import { PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { adminReference } from "@/lib/admin-api";
import { useAdminI18n } from "../ui";
import { BlockedTab } from "./blocked-tab";
import { CitiesTab } from "./cities-tab";
import { CountriesTab } from "./countries-tab";
import { FaqTab } from "./faq-tab";
import { PricesTab } from "./prices-tab";
import { QUERY } from "./shared";

const TABS = ["prices", "countries", "faq", "cities", "blocked"] as const;
type Tab = (typeof TABS)[number];

/** /admin/reference: prices, countries, the landing's FAQ, delivery cities and blocked countries, edited without touching code. */
export function ReferencePage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const [tab, setTab] = useState<Tab>("prices");
  const reference = useQuery({ queryKey: QUERY, queryFn: adminReference });
  const data = reference.data;

  return (
    <>
      <PageHeader size="sm" title={t("admin.reference.title")} lead={t("admin.reference.lead")} />
      <Tabs
        base={tabs}
        data-testid="reference-tabs"
        value={tab}
        onChange={setTab}
        items={TABS.map((id) => ({ id, label: t(`admin.reference.tab.${id}`), testId: `reference-tab-${id}` }))}
      />
      <div {...tabPanelProps(tabs, tab)} className="outline-none">
        {!data ? (
          <QueryState error={reference.error} scope="admin" />
        ) : tab === "prices" ? (
          <PricesTab initial={data.prices} />
        ) : tab === "countries" ? (
          <CountriesTab initial={data.countries} blocked={data.blocked} />
        ) : tab === "faq" ? (
          <FaqTab initial={data.faq} countries={data.countries} />
        ) : tab === "cities" ? (
          <CitiesTab initial={data.cities} />
        ) : (
          <BlockedTab initial={data.blocked} />
        )}
      </div>
    </>
  );
}
