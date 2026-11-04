"use client";

import { methodologyText } from "@fabulka/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageTitle, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";
import { useStoryFormatName } from "./use-story-formats";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { useAdminHref, useCan } from "./working-country";

export function MethodologiesTable() {
  const adminHref = useAdminHref();
  const { t, locale } = useAdminI18n();
  const methods = useAdminMethodologies();
  const canEdit = useCan("methodologies");
  const formatName = useStoryFormatName();

  return (
    <>
      <PageTitle
        aside={
          canEdit && (
            <Link href={adminHref("/admin/methodologies/new")} data-testid="methodology-new" className={buttonClass()}>
              <Plus className="size-4" />
              {t("admin.methods.create")}
            </Link>
          )
        }
      >
        {t("admin.methods.title")}
      </PageTitle>
      <p className="-mt-3 max-w-3xl text-sm text-muted">{t("admin.methods.lead")}</p>
      {methods.isError && <ErrorText>{methods.error.message}</ErrorText>}
      <TableFrame>
        <Table data-testid="methodologies-table">
          <thead>
            <tr>
              <th>{t("admin.methods.name")}</th>
              <th>{t("admin.methods.ages")}</th>
              <th>{t("admin.methods.format")}</th>
              <th>{t("admin.methods.site")}</th>
              <th>{t("admin.methods.usedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {methods.data?.map((m) => (
              <tr key={m.slug} data-testid="methodology-row" data-slug={m.slug} className="hover:bg-background/60">
                <td>
                  <Link href={adminHref(`/admin/methodologies/${m.slug}`)} className="font-semibold hover:text-accent">
                    {methodologyText(m.texts, locale).name || m.slug}
                  </Link>
                  <div className="font-mono text-xs text-muted">{m.slug}</div>
                </td>
                <td className="whitespace-nowrap">
                  {m.ageMin}–{m.ageMax}
                </td>
                <td data-testid="methodology-format-name" className="whitespace-nowrap text-sm">
                  {formatName(m.format)}
                </td>
                <td>
                  <Badge tone={m.published ? "success" : "neutral"}>
                    {m.published ? t("admin.published") : t("admin.draft")}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-muted">
                  {m.templates || m.books ? t("admin.methods.usage", { templates: m.templates, books: m.books }) : t("admin.methods.unused")}
                </td>
              </tr>
            ))}
            {methods.data?.length === 0 && <TableEmpty colSpan={5}>{t("admin.methods.empty")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
    </>
  );
}
