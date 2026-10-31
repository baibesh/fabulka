"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { adminTemplates, updateTemplate } from "@/lib/admin-api";
import { Badge, PageTitle, table, useAdminI18n } from "./ui";
import { useMethodologyName } from "./use-methodologies";

export function CatalogTable() {
  const { t, number } = useAdminI18n();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["admin", "templates"], queryFn: adminTemplates });
  const methodName = useMethodologyName();
  const toggle = useMutation({
    mutationFn: ({ slug, published }: { slug: string; published: boolean }) => updateTemplate(slug, { published }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] }),
  });

  return (
    <>
      <PageTitle>{t("admin.catalog.title")}</PageTitle>
      {templates.isError && <p role="alert" className="text-red-600">{templates.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="catalog-table" className={table}>
          <thead>
            <tr>
              <th>{t("admin.catalog.book")}</th>
              <th>{t("admin.catalog.ages")}</th>
              <th>{t("admin.catalog.method")}</th>
              <th className="text-right">{t("admin.catalog.books")}</th>
              <th>{t("admin.catalog.site")}</th>
            </tr>
          </thead>
          <tbody>
            {templates.data?.map((item) => (
              <tr key={item.slug}>
                <td>
                  <Link href={`/admin/catalog/${item.slug}`} className="flex items-center gap-3 font-semibold hover:text-accent">
                    {item.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- covers are static files of any size
                      <img src={item.coverUrl} alt="" className="size-10 rounded-lg object-cover" />
                    )}
                    {item.title}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  {item.ageMin}–{item.ageMax}
                </td>
                <td className="text-muted">{methodName(item.methodology)}</td>
                <td className="text-right tabular-nums">{number(item.books)}</td>
                <td>
                  <button
                    type="button"
                    data-testid={`publish-${item.slug}`}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ slug: item.slug, published: !item.published })}
                  >
                    <Badge tone={item.published ? "bg-emerald-500/15 text-emerald-600" : "bg-border text-muted"}>
                      {item.published ? t("admin.published") : t("admin.draft")}
                    </Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
