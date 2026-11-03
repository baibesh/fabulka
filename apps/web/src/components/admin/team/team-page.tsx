"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { adminMe } from "@/lib/admin-api";
import { useAdminI18n } from "../ui";
import { CapsTab } from "./caps-tab";
import { PeopleTab } from "./people-tab";
import { RolesTab } from "./roles-tab";

const TABS = ["people", "roles", "caps"] as const;
type Tab = (typeof TABS)[number];

/**
 * /admin/team (superadmin only): who may open the admin — invite by email (Fabulka ID sends the
 * set-up email), edit roles, countries and daily caps, disable — the roles themselves, and the
 * default daily caps on staff generation.
 */
export function TeamPage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const [tab, setTab] = useState<Tab>("people");
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: adminMe, retry: false });

  return (
    <>
      <PageHeader size="sm" title={t("admin.team.title")} lead={t("admin.team.lead")} />
      <Tabs
        base={tabs}
        data-testid="team-tabs"
        value={tab}
        onChange={setTab}
        items={TABS.map((id) => ({ id, label: t(`admin.team.tab.${id}`), testId: `team-tab-${id}` }))}
      />
      <div {...tabPanelProps(tabs, tab)} className="flex flex-col gap-6 outline-none">
        {tab === "people" ? <PeopleTab me={me.data?.who ?? null} /> : tab === "roles" ? <RolesTab /> : <CapsTab />}
      </div>
    </>
  );
}
