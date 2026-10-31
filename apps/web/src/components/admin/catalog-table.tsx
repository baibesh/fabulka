"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { adminTemplates, updateTemplate } from "@/lib/admin-api";
import { Badge, PageTitle, table } from "./ui";
import { useMethodologyName } from "./use-methodologies";

export function CatalogTable() {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["admin", "templates"], queryFn: adminTemplates });
  const methodName = useMethodologyName();
  const toggle = useMutation({
    mutationFn: ({ slug, published }: { slug: string; published: boolean }) => updateTemplate(slug, { published }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] }),
  });

  return (
    <>
      <PageTitle>Каталог книг</PageTitle>
      {templates.isError && <p role="alert" className="text-red-600">{templates.error.message}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table data-testid="catalog-table" className={table}>
          <thead>
            <tr>
              <th>Книга</th>
              <th>Возраст</th>
              <th>Методика</th>
              <th className="text-right">Создано книг</th>
              <th>На сайте</th>
            </tr>
          </thead>
          <tbody>
            {templates.data?.map((t) => (
              <tr key={t.slug}>
                <td>
                  <Link href={`/admin/catalog/${t.slug}`} className="flex items-center gap-3 font-semibold hover:text-accent">
                    {t.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- covers are static files of any size
                      <img src={t.coverUrl} alt="" className="size-10 rounded-lg object-cover" />
                    )}
                    {t.title}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  {t.ageMin}–{t.ageMax}
                </td>
                <td className="text-muted">{methodName(t.methodology)}</td>
                <td className="text-right tabular-nums">{t.books}</td>
                <td>
                  <button
                    type="button"
                    data-testid={`publish-${t.slug}`}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ slug: t.slug, published: !t.published })}
                  >
                    <Badge tone={t.published ? "bg-emerald-500/15 text-emerald-600" : "bg-border text-muted"}>
                      {t.published ? "Опубликована" : "Черновик"}
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
