"use client";

import { methodologyText } from "@fabulka/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge, button, PageTitle, table, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";

export function MethodologiesTable() {
  const { t, locale } = useAdminI18n();
  const methods = useAdminMethodologies();

  return (
    <>
      <PageTitle
        aside={
          <Link href="/admin/methodologies/new" data-testid="methodology-new" className={`${button} flex items-center gap-2`}>
            <Plus className="size-4" />
            {t("admin.methods.create")}
          </Link>
        }
      >
        {t("admin.methods.title")}
      </PageTitle>
      <p className="-mt-3 max-w-3xl text-sm text-muted">{t("admin.methods.lead")}</p>
      {methods.isError && <p role="alert" className="text-red-600">{methods.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="methodologies-table" className={table}>
          <thead>
            <tr>
              <th>{t("admin.methods.name")}</th>
              <th>{t("admin.methods.ages")}</th>
              <th>{t("admin.methods.site")}</th>
              <th>{t("admin.methods.usedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {methods.data?.map((m) => (
              <tr key={m.slug} data-testid="methodology-row" data-slug={m.slug} className="hover:bg-background/60">
                <td>
                  <Link href={`/admin/methodologies/${m.slug}`} className="font-semibold hover:text-accent">
                    {methodologyText(m.texts, locale).name || m.slug}
                  </Link>
                  <div className="font-mono text-xs text-muted">{m.slug}</div>
                </td>
                <td className="whitespace-nowrap">
                  {m.ageMin}–{m.ageMax}
                </td>
                <td>
                  <Badge tone={m.published ? "bg-emerald-500/15 text-emerald-600" : "bg-border text-muted"}>
                    {m.published ? t("admin.published") : t("admin.draft")}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-muted">
                  {m.templates || m.books ? t("admin.methods.usage", { templates: m.templates, books: m.books }) : t("admin.methods.unused")}
                </td>
              </tr>
            ))}
            {methods.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  {t("admin.methods.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
