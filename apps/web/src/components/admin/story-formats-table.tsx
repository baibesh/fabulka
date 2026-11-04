"use client";

import { framesRange, storyFormatText } from "@fabulka/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { GridThumb } from "./grid-thumb";
import { PageTitle, useAdminI18n } from "./ui";
import { useAdminStoryFormats } from "./use-story-formats";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/ui/notice";
import { buttonClass } from "@/components/ui/button";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { useAdminHref, useCan } from "./working-country";

/** /admin/story-formats: every format with its grids, its kinds of text and what a book of it costs. */
export function StoryFormatsTable() {
  const adminHref = useAdminHref();
  const { t, locale } = useAdminI18n();
  const formats = useAdminStoryFormats();
  const canEdit = useCan("story_formats");

  return (
    <>
      <PageTitle
        aside={
          canEdit && (
            <Link href={adminHref("/admin/story-formats/new")} data-testid="story-format-new" className={buttonClass()}>
              <Plus className="size-4" />
              {t("admin.formats.create")}
            </Link>
          )
        }
      >
        {t("admin.formats.title")}
      </PageTitle>
      <p className="-mt-3 max-w-3xl text-sm text-muted">{t("admin.formats.lead")}</p>
      {formats.isError && <ErrorText>{formats.error.message}</ErrorText>}
      <TableFrame>
        <Table data-testid="story-formats-table">
          <thead>
            <tr>
              <th>{t("admin.formats.name")}</th>
              <th>{t("admin.formats.frames")}</th>
              <th>{t("admin.formats.texts")}</th>
              <th>{t("admin.formats.estimate")}</th>
              <th>{t("admin.methods.site")}</th>
              <th>{t("admin.methods.usedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {formats.data?.map((f) => {
              const range = framesRange(f);
              return (
                <tr key={f.slug} data-testid="story-format-row" data-slug={f.slug} className="hover:bg-background/60">
                  <td>
                    <Link href={adminHref(`/admin/story-formats/${f.slug}`)} className="font-semibold hover:text-accent">
                      {storyFormatText(f.texts, locale).name || f.slug}
                    </Link>
                    <div className="font-mono text-xs text-muted">{f.slug}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      {f.grids.slice(0, 4).map((g) => (
                        <GridThumb key={g.id} grid={g} size={28} />
                      ))}
                      <span className="whitespace-nowrap text-sm text-muted">{range.min === range.max ? range.min : `${range.min}-${range.max}`}</span>
                    </div>
                  </td>
                  <td className="text-sm">{f.textRules.map((r) => t(`admin.format.kind.${r.kind}`)).join(", ")}</td>
                  <td data-testid="story-format-estimate" className="whitespace-nowrap text-sm">
                    {t("admin.formats.estimate.value", { usd: f.estimate.usd.toFixed(2), minutes: Math.max(1, Math.round(f.estimate.seconds / 60)) })}
                  </td>
                  <td>
                    <Badge tone={f.published ? "success" : "neutral"}>{f.published ? t("admin.published") : t("admin.draft")}</Badge>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    {f.methodologies.length || f.books ? t("admin.formats.usage", { methods: f.methodologies.length, books: f.books }) : t("admin.formats.unused")}
                  </td>
                </tr>
              );
            })}
            {formats.data?.length === 0 && <TableEmpty colSpan={6}>{t("admin.formats.empty")}</TableEmpty>}
          </tbody>
        </Table>
      </TableFrame>
    </>
  );
}
