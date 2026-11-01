"use client";

import { JOURNAL_PERIODS, type JournalPeriod } from "@fabulka/shared";
import { useState } from "react";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { useAdminI18n } from "../ui";
import { Calls } from "./calls";
import { Errors } from "./errors";
import { Summary } from "./summary";

/** Model calls and the errors visitors ran into, for finding what breaks and what it costs. */
export function Journal() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const [period, setPeriod] = useState<JournalPeriod>("24h");
  const [tab, setTab] = useState<"calls" | "errors">("calls");

  return (
    <>
      <PageHeader
        size="sm"
        title={t("admin.journal.title")}
        aside={
          <Select
            data-testid="journal-period"
            className="sm:w-40"
            value={period}
            onChange={(e) => setPeriod(e.target.value as JournalPeriod)}
          >
            {JOURNAL_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.journal.period.${p}`)}
              </option>
            ))}
          </Select>
        }
      />
      <Tabs
        base={tabs}
        value={tab}
        onChange={setTab}
        items={[
          { id: "calls", label: t("admin.journal.tab.calls"), testId: "journal-tab-calls" },
          { id: "errors", label: t("admin.journal.tab.errors"), testId: "journal-tab-errors" },
        ]}
      />
      <div {...tabPanelProps(tabs, tab)} className="flex flex-col gap-6 outline-none">
        {tab === "calls" ? (
          <>
            <Summary period={period} />
            <Calls period={period} />
          </>
        ) : (
          <Errors period={period} />
        )}
      </div>
    </>
  );
}
