"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge, button, PageTitle, table } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";

/** The page's words, kept together for the admin's translation. */
const TEXT = {
  title: "Методики",
  lead: "По методике Muse Spark строит сюжет: шаги, правила и чего избегать. Родителям показываются только опубликованные.",
  create: "Новая методика",
  name: "Методика",
  ages: "Возраст",
  site: "На сайте",
  usedBy: "Используют",
  published: "Опубликована",
  draft: "Черновик",
  usage: (templates: number, books: number) => `каталог: ${templates} · книги: ${books}`,
  unused: "не используется",
  empty: "Методик пока нет",
};

export function MethodologiesTable() {
  const methods = useAdminMethodologies();

  return (
    <>
      <PageTitle
        aside={
          <Link href="/admin/methodologies/new" data-testid="methodology-new" className={`${button} flex items-center gap-2`}>
            <Plus className="size-4" />
            {TEXT.create}
          </Link>
        }
      >
        {TEXT.title}
      </PageTitle>
      <p className="-mt-3 max-w-3xl text-sm text-muted">{TEXT.lead}</p>
      {methods.isError && <p role="alert" className="text-red-600">{methods.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="methodologies-table" className={table}>
          <thead>
            <tr>
              <th>{TEXT.name}</th>
              <th>{TEXT.ages}</th>
              <th>{TEXT.site}</th>
              <th>{TEXT.usedBy}</th>
            </tr>
          </thead>
          <tbody>
            {methods.data?.map((m) => (
              <tr key={m.slug} data-testid="methodology-row" data-slug={m.slug} className="hover:bg-background/60">
                <td>
                  <Link href={`/admin/methodologies/${m.slug}`} className="font-semibold hover:text-accent">
                    {m.texts.ru.name || m.slug}
                  </Link>
                  <div className="font-mono text-xs text-muted">{m.slug}</div>
                </td>
                <td className="whitespace-nowrap">
                  {m.ageMin}–{m.ageMax}
                </td>
                <td>
                  <Badge tone={m.published ? "bg-emerald-500/15 text-emerald-600" : "bg-border text-muted"}>
                    {m.published ? TEXT.published : TEXT.draft}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-muted">
                  {m.templates || m.books ? TEXT.usage(m.templates, m.books) : TEXT.unused}
                </td>
              </tr>
            ))}
            {methods.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  {TEXT.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
