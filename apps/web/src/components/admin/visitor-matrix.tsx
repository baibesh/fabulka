"use client";

import { useQuery } from "@tanstack/react-query";
import { LANGUAGES, LANGUAGE_NAMES, OTHER_COUNTRY, type CountryOverview, type OverviewLanguage, type VisitorCell } from "@fabulka/shared";
import { ExternalLink } from "lucide-react";
import { countriesOverview, visitorMatrix } from "@/lib/admin-api";
import { useCountryName } from "@/hooks/use-country-name";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/ui/flag";
import { BackLink } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { Table, TableFrame } from "@/components/ui/table";
import { cx } from "@/components/ui/cx";
import { previewHref } from "./reference/landing-images";
import { PageTitle, useAdminI18n } from "./ui";
import { useAdminHref, useWorkingCountry } from "./working-country";

/**
 * «What a visitor sees»: for each country (the session's; every offered one and "other" for global
 * staff) and each language, the examples the home page shows there, or the catalog samples filling
 * in when there are none. The API builds it with the site's own selection, so the two never
 * disagree. Empty cells stand out; a language the country does not offer is dimmed (its visitors are
 * switched to another one). Each row says what the country charges and how many gaps it has; below,
 * the country overview has the details (prices, samples per catalog book, the landing's hero) and
 * marks every gap the content job is to fill. Every offered cell opens the site as that visitor.
 */
export function VisitorMatrixPage() {
  const adminHref = useAdminHref();
  const { t, money } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { country } = useWorkingCountry();
  const matrix = useQuery({ queryKey: ["admin", "visitor-matrix"], queryFn: visitorMatrix });
  const overview = useQuery({ queryKey: ["admin", "countries-overview"], queryFn: countriesOverview });
  const byCountry = new Map(overview.data?.map((row) => [row.country, row]));

  return (
    <>
      <BackLink href={adminHref("/admin/examples")}>{t("admin.matrix.back")}</BackLink>
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
              {matrix.data.map((row) => {
                const info = byCountry.get(row.country);
                return (
                  <tr
                    key={row.country}
                    data-testid={`matrix-row-${row.country}`}
                    data-selected={row.country === country ? "true" : "false"}
                    data-listed={row.listed ? "true" : "false"}
                    className={cx(row.country === country && "bg-accent/5")}
                  >
                    <th scope="row" className="text-left align-top font-semibold">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Flag code={row.country} />
                        {countryName(row.country)}
                      </span>
                      {!row.listed && (
                        <p data-testid="matrix-not-listed" className="mt-1 text-[11px] font-semibold text-warning">
                          {t("admin.matrix.notListed")}
                        </p>
                      )}
                      {info && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted">
                          <span data-testid={`matrix-currency-${row.country}`}>
                            {info.currency}
                            {info.prices.template && ` · ${money(info.prices.template)}`}
                          </span>
                          <a href={`#overview-${row.country}`}>
                            <Badge
                              data-testid={`matrix-gaps-${row.country}`}
                              data-count={info.gaps.length}
                              tone={info.gaps.length ? "warning" : "success"}
                            >
                              {info.gaps.length ? t("admin.matrix.gaps", { count: info.gaps.length }) : t("admin.overview.none")}
                            </Badge>
                          </a>
                        </span>
                      )}
                    </th>
                    {row.cells.map((cell) => (
                      <Cell key={cell.language} country={row.country} cell={cell} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <h2 className="mt-4 text-xl font-extrabold">{t("admin.overview.title")}</h2>
      <p className="max-w-3xl text-sm text-muted">{t("admin.overview.lead")}</p>
      {!overview.data ? (
        <QueryState error={overview.error} scope="admin" />
      ) : (
        <div data-testid="countries-overview" className="flex flex-col gap-3">
          {overview.data.map((row) => (
            <OverviewCard key={row.country} row={row} open={row.country === country} />
          ))}
        </div>
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
      className={cx("min-w-36 align-top", cell.kind === "empty" && cell.offered && "bg-warning/10", !cell.offered && "opacity-50")}
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
      {cell.offered && (
        <a
          href={previewHref(country, cell.language)}
          target="_blank"
          rel="noopener"
          data-testid={`matrix-preview-${country}-${cell.language}`}
          title={t("admin.preview.title", { language: LANGUAGE_NAMES[cell.language] })}
          className="mt-1.5 flex w-fit items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
        >
          <ExternalLink className="size-3" aria-hidden />
          {t("admin.matrix.preview")}
        </a>
      )}
    </td>
  );
}

/** One country in the overview: what it charges, its gaps, and per language its landing, examples and samples. */
function OverviewCard({ row, open }: { row: CountryOverview; open: boolean }) {
  const { t, money } = useAdminI18n();
  const countryName = useCountryName("admin");
  const gapText = (gap: CountryOverview["gaps"][number]) =>
    t(`admin.overview.gap.${gap.code}`, { language: gap.language ? LANGUAGE_NAMES[gap.language] : "" });
  return (
    <details
      id={`overview-${row.country}`}
      data-testid={`overview-${row.country}`}
      data-listed={row.listed ? "true" : "false"}
      data-gaps={row.gaps.length}
      open={open}
      className="rounded-2xl border border-border bg-card p-4"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 font-bold">
          <Flag code={row.country} />
          {countryName(row.country)}
        </span>
        <span className="text-sm text-muted">{row.languages.map((l) => LANGUAGE_NAMES[l]).join(", ")}</span>
        <span data-testid="overview-prices" data-currency={row.currency} className="text-sm">
          {row.prices.template && row.prices.custom
            ? t("admin.overview.prices", { template: money(row.prices.template), custom: money(row.prices.custom) })
            : row.currency}
        </span>
        <Badge tone={row.prices.own ? "accent" : "neutral"}>{row.prices.own ? t("admin.overview.prices.own") : t("admin.overview.prices.default")}</Badge>
        <Badge tone="neutral">{row.print ? t("admin.overview.print") : t("admin.overview.noPrint")}</Badge>
        <span className="flex flex-wrap gap-1.5">
          {row.gaps.length === 0 ? (
            <Badge tone="success">{t("admin.overview.none")}</Badge>
          ) : (
            row.gaps.map((gap) => (
              <Badge key={`${gap.code}-${gap.language ?? ""}`} tone="warning" data-testid="gap" data-gap={gap.code} data-language={gap.language ?? ""}>
                {gapText(gap)}
              </Badge>
            ))
          )}
        </span>
      </summary>
      <p className="mt-3 text-sm text-muted">{t("admin.overview.counts", { examples: row.localExamples, samples: row.countrySamples })}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {row.byLanguage.map((language) => (
          <LanguageColumn key={language.language} country={row.country} listed={row.listed} entry={language} />
        ))}
      </div>
    </details>
  );
}

function LanguageColumn({ country, listed, entry }: { country: string; listed: boolean; entry: OverviewLanguage }) {
  const { t } = useAdminI18n();
  const { landing, examples, samples } = entry;
  const local = country !== OTHER_COUNTRY && listed;
  return (
    <section data-testid={`overview-${country}-${entry.language}`} className="flex flex-col gap-3 rounded-xl bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{LANGUAGE_NAMES[entry.language]}</h3>
        <a
          href={previewHref(country, entry.language)}
          target="_blank"
          rel="noopener"
          data-testid={`overview-preview-${country}-${entry.language}`}
          className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          <ExternalLink className="size-3" aria-hidden />
          {t("admin.matrix.preview")}
        </a>
      </div>

      {local && (
        <div data-testid="overview-landing" data-image={landing.heroImage ? landing.heroImage.scope : "default"} className="flex gap-3">
          {landing.heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored files, served by the API
            <img src={landing.heroImage.src} alt="" className="size-16 shrink-0 rounded-lg border border-border bg-white object-cover" />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-warning bg-warning/10 p-1 text-center text-[10px] font-semibold text-warning">
              {t("admin.overview.landing.defaultImage")}
            </span>
          )}
          <div className="min-w-0 text-sm">
            <p className="text-xs font-semibold text-muted">{t("admin.overview.landing")}</p>
            {landing.title ? <p className="font-semibold">{landing.title}</p> : <p className="text-warning">{t("admin.overview.landing.defaultTitle")}</p>}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted">
          {t("admin.overview.examples")}
          {examples.kind === "example" && local && ` · ${t("admin.overview.examples.local", { count: examples.local })}`}
        </p>
        {examples.kind === "empty" ? (
          <p className="text-sm font-semibold text-warning">{t("admin.matrix.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-sm">
            {examples.items.map((item) => (
              <li key={item.id} className="line-clamp-1">
                {item.title}
              </li>
            ))}
            {examples.kind === "sample" && (
              <li>
                <Badge tone="warning">{t("admin.matrix.samples")}</Badge>
              </li>
            )}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">{t("admin.overview.samples")}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {samples.map((sample) => {
            const state = !sample.offered ? "unavailable" : !sample.sample ? "missing" : sample.sample.scope;
            return (
              <li key={sample.templateId} data-testid="overview-sample" data-slug={sample.slug} data-state={state} className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 min-w-0">{sample.title}</span>
                <Badge tone={state === "country" ? "success" : state === "global" ? "neutral" : state === "missing" ? "warning" : "neutral"}>
                  {t(`admin.overview.sample.${state}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
