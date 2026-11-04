"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { CATALOG_LAST_COUNTRY, SCOPE_FORBIDDEN, allowedFor, ruleShows, type AdminTemplate } from "@fabulka/shared";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { adminTemplates, setTemplateVisibility, updateTemplate } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { useCountryName } from "@/hooks/use-country-name";
import { Flag } from "@/components/ui/flag";
import { PageTitle, useAdminI18n } from "./ui";
import { useAdminHref, useWorkingCountry } from "./working-country";
import { useMethodologyName } from "./use-methodologies";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/ui/notice";
import { Table, TableFrame } from "@/components/ui/table";
import { NotOffered } from "./not-offered";

/** A catalog API refusal in the admin's words. */
export function useCatalogError() {
  const { t } = useAdminI18n();
  return (error: Error | null) => {
    if (!error) return null;
    if (error instanceof ApiError && error.code === SCOPE_FORBIDDEN) return t("admin.scope.forbidden");
    if (error instanceof ApiError && error.code === CATALOG_LAST_COUNTRY) return t("admin.catalog.lastCountry");
    return error.message;
  };
}

/**
 * The catalog: each book with its ages, method, books made and whether it is published; and where
 * it is listed: shown or hidden in the working country (a toggle that changes that country only),
 * or, for "All countries", the countries it is limited to. Publishing is the same everywhere, so
 * only global staff change it.
 */
export function CatalogTable() {
  const adminHref = useAdminHref();
  const { t, number } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useCatalogError();
  const { country, access } = useWorkingCountry();
  const global = allowedFor(access, "catalog", null);
  const templates = useQuery({ queryKey: ["admin", "templates"], queryFn: adminTemplates });
  const methodName = useMethodologyName();
  const toggle = useMutation({
    mutationFn: ({ slug, published }: { slug: string; published: boolean }) => updateTemplate(slug, { published }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] }),
  });
  const visibility = useMutation({
    mutationFn: ({ slug, visible }: { slug: string; visible: boolean }) => setTemplateVisibility(slug, country!, visible),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "templates"] }),
  });

  return (
    <>
      <PageTitle>{t("admin.catalog.title")}</PageTitle>
      {templates.isError && <ErrorText>{templates.error.message}</ErrorText>}
      {visibility.isError && <ErrorText data-testid="catalog-error">{errorText(visibility.error)}</ErrorText>}
      <TableFrame>
        <Table data-testid="catalog-table">
          <thead>
            <tr>
              <th>{t("admin.catalog.book")}</th>
              <th>{t("admin.catalog.ages")}</th>
              <th>{t("admin.catalog.method")}</th>
              <th className="text-right">{t("admin.catalog.books")}</th>
              <th>{country ? t("admin.catalog.visibleIn") : t("admin.catalog.countries")}</th>
              <th>{t("admin.catalog.site")}</th>
            </tr>
          </thead>
          <tbody>
            {templates.data?.map((item) => (
              <tr key={item.slug}>
                <td>
                  <Link href={adminHref(`/admin/catalog/${item.slug}`)} className="flex items-center gap-3 font-semibold hover:text-accent">
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
                  {country ? (
                    <VisibilityToggle
                      template={item}
                      country={country}
                      disabled={visibility.isPending || !allowedFor(access, "catalog", [country])}
                      onChange={(visible) => visibility.mutate({ slug: item.slug, visible })}
                    />
                  ) : (
                    <ListedIn template={item} />
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    data-testid={`publish-${item.slug}`}
                    disabled={toggle.isPending || !global}
                    onClick={() => toggle.mutate({ slug: item.slug, published: !item.published })}
                  >
                    <Badge tone={item.published ? "success" : "neutral"}>
                      {item.published ? t("admin.published") : t("admin.draft")}
                    </Badge>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableFrame>
    </>
  );
}

/** Shown or hidden in the working country, as a visitor from there sees the catalog. */
function VisibilityToggle({ template, country, disabled, onChange }: { template: AdminTemplate; country: string; disabled: boolean; onChange: (visible: boolean) => void }) {
  const { t } = useAdminI18n();
  const visible = ruleShows({ mode: template.countriesMode, countries: template.countries }, country);
  return (
    <button
      type="button"
      data-testid={`catalog-visible-${template.slug}`}
      data-visible={visible ? "true" : "false"}
      aria-pressed={visible}
      disabled={disabled}
      onClick={() => onChange(!visible)}
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm font-semibold disabled:opacity-60"
    >
      {visible ? <Eye className="size-4 text-success" /> : <EyeOff className="size-4 text-muted" />}
      {visible ? t("admin.catalog.visible") : t("admin.catalog.hidden")}
    </button>
  );
}

/** Where the catalog lists the book: everywhere, only in some countries, or everywhere but some. */
function ListedIn({ template }: { template: AdminTemplate }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  if (!template.countries.length) return <span className="text-sm text-muted">{t("admin.template.countries.all")}</span>;
  return (
    <span data-testid={`catalog-countries-${template.slug}`} data-mode={template.countriesMode} className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted">{template.countriesMode === "exclude" ? t("admin.countries.mode.exclude") : t("admin.countries.mode.include")}:</span>
      {template.countries.map((code) => (
        <span key={code} title={countryName(code)} className="flex items-center gap-1">
          <Flag code={code} />
          {code}
          <NotOffered code={code} />
        </span>
      ))}
    </span>
  );
}
