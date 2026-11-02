"use client";

import { LanguageSchema, type AdminSeoPage, type Language } from "@fabulka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { Table, TableFrame } from "@/components/ui/table";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { publishSeo, seoPages, seoPending } from "@/lib/admin-api";
import { useAdminI18n } from "../ui";
import { RedirectsTab } from "./redirects-tab";
import { SettingsTab } from "./settings-tab";
import { LanguageFlags } from "./shared";

const TABS = ["pages", "redirects", "settings"] as const;
type Tab = (typeof TABS)[number];

/** The language and tab of /admin/seo live in its address (?version=de&tab=settings), so links and Back keep them. Not ?lang=, which is the admin's own interface language. */
export function useSeoParams() {
  const params = useSearchParams();
  const language = LanguageSchema.catch("ru").parse(params.get("version"));
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "pages";
  return { language, tab };
}

/**
 * /admin/seo: per-page SEO by language version (pick a language, then a page), the redirects and
 * the global settings. A save keeps a draft; «Опубликовать» makes drafts live on the site at once.
 */
export function SeoSection() {
  const { t } = useAdminI18n();
  const router = useRouter();
  const pathname = usePathname();
  const tabs = useTabsId();
  const { language, tab } = useSeoParams();
  const go = (next: { lang?: Language; tab?: Tab }) => {
    const query = new URLSearchParams({ version: next.lang ?? language, ...((next.tab ?? tab) !== "pages" ? { tab: next.tab ?? tab } : {}) });
    router.replace(`${pathname}?${query}`);
  };

  return (
    <>
      <PageHeader size="sm" title={t("admin.seo.title")} lead={t("admin.seo.lead")} />
      <Tabs
        base={tabs}
        data-testid="seo-tabs"
        value={tab}
        onChange={(id) => go({ tab: id })}
        items={TABS.map((id) => ({ id, label: t(`admin.seo.tab.${id}`), testId: `seo-tab-${id}` }))}
      />
      <div {...tabPanelProps(tabs, tab)} className="flex flex-col gap-6 outline-none">
        {tab === "pages" ? <PagesTab language={language} onLanguage={(lang) => go({ lang })} /> : tab === "redirects" ? <RedirectsTab /> : <SettingsTab />}
      </div>
    </>
  );
}

function PagesTab({ language, onLanguage }: { language: Language; onLanguage: (language: Language) => void }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const pages = useQuery({ queryKey: ["admin", "seo", "pages", language], queryFn: () => seoPages(language) });
  const pending = useQuery({ queryKey: ["admin", "seo", "pending"], queryFn: seoPending });
  const total = Object.values(pending.data ?? {}).reduce((a, b) => a + b, 0);
  const publish = useMutation({
    mutationFn: () => publishSeo(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "seo"] }),
  });

  return (
    <>
      <Notice tone="highlight" icon={<Info className="size-5 shrink-0 text-accent" />} data-testid="seo-language-note">
        <p>{t("admin.seo.languageNote")}</p>
      </Notice>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <LanguageFlags value={language} onChange={onLanguage} pending={pending.data} />
        <div className="flex items-center gap-3">
          {publish.isSuccess && (
            <span data-testid="seo-published" className="text-sm text-success">
              {t("admin.seo.publishedCount", { n: publish.data.published })}
            </span>
          )}
          <Button data-testid="seo-publish-all" loading={publish.isPending} disabled={!total} icon={<Send className="size-4" />} onClick={() => publish.mutate()}>
            {t("admin.seo.publishAll", { n: total })}
          </Button>
        </div>
      </div>
      {publish.isSuccess && !publish.data.revalidated && <Notice tone="warning">{t("admin.seo.notRevalidated")}</Notice>}
      {publish.isError && <Notice tone="danger">{publish.error.message}</Notice>}
      {!pages.data ? <QueryState error={pages.error} scope="admin" /> : <PagesTable pages={pages.data} language={language} />}
    </>
  );
}

function PagesTable({ pages, language }: { pages: AdminSeoPage[]; language: Language }) {
  const { t } = useAdminI18n();
  const name = (page: AdminSeoPage) =>
    page.kind === "static" ? t(`admin.seo.page.${page.key as "home" | "catalog" | "create" | "privacy" | "terms"}`) : (page.label ?? page.key);
  return (
    <TableFrame>
      <Table data-testid="seo-pages">
        <thead>
          <tr>
            <th>{t("admin.seo.col.page")}</th>
            <th>{t("admin.seo.col.kind")}</th>
            <th>{t("admin.seo.col.status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const live = page.published;
            const custom = Boolean(live && (live.title || live.description || live.ogImage));
            return (
              <tr key={page.key} data-testid={`seo-row-${page.key}`}>
                <td>
                  <div className="flex flex-col">
                    <span className="font-semibold">{name(page)}</span>
                    <span className="font-mono text-xs text-muted">{page.path}</span>
                  </div>
                </td>
                <td className="text-muted">{t(`admin.seo.kind.${page.kind}`)}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={custom ? "accent" : "neutral"} data-testid="seo-row-status">
                      {custom ? t("admin.seo.status.custom") : t("admin.seo.status.default")}
                    </Badge>
                    {live?.noindex && (
                      <Badge tone="danger" data-testid="seo-row-noindex">
                        noindex
                      </Badge>
                    )}
                    {page.pending && (
                      <Badge tone="warning" data-testid="seo-row-pending">
                        {t("admin.seo.status.pending")}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/seo/edit?${new URLSearchParams({ key: page.key, version: language })}`}
                    data-testid={`seo-edit-${page.key}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    {t("admin.seo.edit")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableFrame>
  );
}
