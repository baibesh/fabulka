"use client";

import { useQuery } from "@tanstack/react-query";
import { LANGUAGES, LANGUAGE_NAMES, type VisitorCell } from "@fabulka/shared";
import { visitorMatrix } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/ui/flag";
import { BackLink } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { Table, TableFrame } from "@/components/ui/table";
import { cx } from "@/components/ui/cx";
import { PageTitle, useAdminI18n } from "./ui";
import { useWorkingCountry } from "./working-country";

/**
 * «What a visitor sees»: for each country (the session's; every offered one and "other" for global
 * staff) and each language, the examples the home page shows there, or the catalog samples filling
 * in when there are none. The API builds it with the site's own selection, so the two never
 * disagree. Empty cells stand out; a language the country does not offer is dimmed (its visitors are
 * switched to another one).
 */
export function VisitorMatrixPage() {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { country } = useWorkingCountry();
  const matrix = useQuery({ queryKey: ["admin", "visitor-matrix"], queryFn: visitorMatrix });

  return (
    <>
      <BackLink href="/admin/examples">{t("admin.matrix.back")}</BackLink>
      <PageTitle>{t("admin.matrix.title")}</PageTitle>
      <p className="max-w-3xl text-sm text-muted">{t("admin.matrix.lead")}</p>
      {!matrix.data ? (
        <QueryState error={matrix.error} scope="admin" />
      ) : (
        <TableFrame>
          <Table data-testid="visitor-matrix">
            <thead>
              <tr>
                <th>{t("admin.matrix.country")}</th>
                {LANGUAGES.map((language) => (
                  <th key={language}>{LANGUAGE_NAMES[language]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.data.map((row) => (
                <tr
                  key={row.country}
                  data-testid={`matrix-row-${row.country}`}
                  data-selected={row.country === country ? "true" : "false"}
                  className={cx(row.country === country && "bg-accent/5")}
                >
                  <th scope="row" className="whitespace-nowrap text-left font-semibold">
                    <span className="flex items-center gap-2">
                      <Flag code={row.country} />
                      {countryName(row.country)}
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <Cell key={cell.language} country={row.country} cell={cell} />
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}

function Cell({ country, cell }: { country: string; cell: VisitorCell }) {
  const { t } = useAdminI18n();
  return (
    <td
      data-testid={`matrix-${country}-${cell.language}`}
      data-kind={cell.kind}
      data-offered={cell.offered ? "true" : "false"}
      data-count={cell.items.length}
      className={cx("min-w-44 align-top", cell.kind === "empty" && cell.offered && "bg-warning/10", !cell.offered && "opacity-50")}
    >
      {cell.kind === "empty" ? (
        <span className={cx("text-xs font-semibold", cell.offered ? "text-warning" : "text-muted")}>{t("admin.matrix.empty")}</span>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cell.items.map((item) => (
            <li key={item.id} data-testid="matrix-item" data-book-id={item.id} className="flex items-center gap-2 text-xs">
              {item.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
                <img src={item.heroImageUrl} alt="" className="size-8 shrink-0 rounded-md border border-border bg-white object-contain" />
              ) : (
                <span className="size-8 shrink-0 rounded-md bg-border" />
              )}
              <span className="line-clamp-2 min-w-0">{item.title}</span>
            </li>
          ))}
        </ul>
      )}
      {cell.kind === "sample" && (
        <Badge tone="neutral" className="mt-1.5">
          {t("admin.matrix.samples")}
        </Badge>
      )}
      {!cell.offered && <p className="mt-1 text-[11px] text-muted">{t("admin.matrix.notOffered")}</p>}
    </td>
  );
}
