"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  COUNTRY_POLICY_BLOCKED,
  CitiesSchema,
  CountryCodeSchema,
  PricesSchema,
  type AdminReference,
  type BlockedCountries,
  type City,
  type Prices,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { intlLocale } from "@/i18n/format";
import type { MessageKey } from "@/i18n/messages";
import { adminReference, saveBlocked, saveCities, savePrices } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { button, Card, ghostButton, input, PageTitle, useAdminI18n } from "./ui";

const TABS = ["prices", "cities", "blocked"] as const;
type Tab = (typeof TABS)[number];

const label = "flex flex-col gap-1.5 text-sm font-semibold";
const errorText = "text-sm font-normal text-red-600";
const QUERY = ["admin", "reference"];

/** /admin/reference: prices, delivery cities and blocked countries, edited without touching code. */
export function ReferencePage() {
  const { t } = useAdminI18n();
  const [tab, setTab] = useState<Tab>("prices");
  const reference = useQuery({ queryKey: QUERY, queryFn: adminReference });
  const tabClass = (active: boolean) => `rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap ${active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`;

  return (
    <>
      <PageTitle>{t("admin.reference.title")}</PageTitle>
      <p className="-mt-3 max-w-3xl text-sm text-muted">{t("admin.reference.lead")}</p>
      <div role="tablist" data-testid="reference-tabs" className="flex gap-1 overflow-x-auto">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`reference-tab-${id}`} onClick={() => setTab(id)} className={tabClass(tab === id)}>
            {t(`admin.reference.tab.${id}`)}
          </button>
        ))}
      </div>
      {reference.isError && <p role="alert" className="text-red-600">{reference.error.message}</p>}
      {!reference.data ? (
        !reference.isError && <p className="text-muted">{t("admin.loading")}</p>
      ) : tab === "prices" ? (
        <PricesTab initial={reference.data.prices} />
      ) : tab === "cities" ? (
        <CitiesTab initial={reference.data.cities} />
      ) : (
        <BlockedTab initial={reference.data.blocked} />
      )}
    </>
  );
}

/** Puts a saved part into the admin's copy and makes the site load the new prices and cities. */
function useSaved() {
  const queryClient = useQueryClient();
  return (patch: Partial<AdminReference>) => {
    queryClient.setQueryData<AdminReference>(QUERY, (old) => (old ? { ...old, ...patch } : old));
    void queryClient.invalidateQueries({ queryKey: ["reference"] });
  };
}

/** Issues by path ("books.template.KZT", "3.ru"), first one per path. */
function issuesByPath(issues: { path: PropertyKey[]; code: string }[]) {
  const byPath: Record<string, string> = {};
  for (const issue of issues) byPath[issue.path.join(".")] ??= issue.code;
  return byPath;
}

function SaveBar({ testId = "reference-save", pending, saved, error, problems }: { testId?: string; pending: boolean; saved: boolean; error: Error | null; problems: boolean }) {
  const { t } = useAdminI18n();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" data-testid={testId} disabled={pending} className={`${button} flex items-center gap-2`}>
        <Save className="size-4" />
        {t("admin.save")}
      </button>
      {saved && (
        <span data-testid="reference-saved" className="text-sm text-emerald-600">
          {t("admin.saved")}
        </span>
      )}
      {problems && (
        <span role="alert" data-testid="reference-problems" className="text-sm text-red-600">
          {t("admin.reference.check")}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error.message}
        </span>
      )}
    </div>
  );
}

// ---- Prices ----------------------------------------------------------------------------------

/** Each price field: its test id, where it sits in Prices, its label and the message for a bad value. */
const PRICE_FIELDS = {
  "template-kzt": { path: "books.template.KZT", error: "admin.reference.error.tenge" },
  "template-usd": { path: "books.template.USD", error: "admin.reference.error.usd" },
  "custom-kzt": { path: "books.custom.KZT", error: "admin.reference.error.tenge" },
  "custom-usd": { path: "books.custom.USD", error: "admin.reference.error.usd" },
  "cover-soft": { path: "covers.soft", error: "admin.reference.error.tenge" },
  "cover-hard": { path: "covers.hard", error: "admin.reference.error.tenge" },
  delivery: { path: "deliveryKzt", error: "admin.reference.error.delivery" },
} satisfies Record<string, { path: string; error: MessageKey }>;
type PriceField = keyof typeof PRICE_FIELDS;
type PriceDraft = Record<PriceField, string>;

const toPriceDraft = (p: Prices): PriceDraft => ({
  "template-kzt": String(p.books.template.KZT),
  "template-usd": String(p.books.template.USD),
  "custom-kzt": String(p.books.custom.KZT),
  "custom-usd": String(p.books.custom.USD),
  "cover-soft": String(p.covers.soft),
  "cover-hard": String(p.covers.hard),
  delivery: String(p.deliveryKzt),
});

/** "1 900" or "3,9" as typed; an empty field is not zero. */
const amount = (text: string) => (text.trim() ? Number(text.replace(/\s/g, "").replace(",", ".")) : Number.NaN);

const fromPriceDraft = (d: PriceDraft): Prices => ({
  books: {
    template: { KZT: amount(d["template-kzt"]), USD: amount(d["template-usd"]) },
    custom: { KZT: amount(d["custom-kzt"]), USD: amount(d["custom-usd"]) },
  },
  covers: { soft: amount(d["cover-soft"]), hard: amount(d["cover-hard"]) },
  deliveryKzt: amount(d.delivery),
});

function PricesTab({ initial }: { initial: Prices }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const [draft, setDraft] = useState(() => toPriceDraft(initial));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (next: PriceDraft) => {
      // Checked here with the API's own rules, so each problem shows next to its field.
      const parsed = PricesSchema.safeParse(fromPriceDraft(next));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? savePrices(parsed.data) : null;
    },
    onSuccess: (prices) => {
      if (!prices) return;
      saved({ prices });
      setDraft(toPriceDraft(prices));
    },
  });

  const field = (id: PriceField, text: string, step: string) => {
    const problem = problems[PRICE_FIELDS[id].path];
    return (
      <label className={label}>
        {text}
        <input
          data-testid={`price-${id}`}
          inputMode={step === "1" ? "numeric" : "decimal"}
          value={draft[id]}
          aria-invalid={!!problem}
          onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
          className={`${input} aria-[invalid=true]:border-red-600`}
        />
        {problem && (
          <span data-testid="reference-error" className={errorText}>
            {t(PRICE_FIELDS[id].error)}
          </span>
        )}
      </label>
    );
  };

  return (
    <form
      data-testid="reference-prices"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(draft);
      }}
      className="flex flex-col gap-4"
    >
      <Card title={t("admin.reference.books")}>
        <p className="-mt-2 text-sm text-muted">{t("admin.reference.books.hint")}</p>
        <div className="grid gap-5 md:grid-cols-2">
          {(["template", "custom"] as const).map((kind) => (
            <fieldset key={kind} className="flex flex-col gap-3 rounded-xl bg-background p-4">
              <legend className="contents font-bold">{t(`admin.reference.kind.${kind}`)}</legend>
              <div className="grid grid-cols-2 gap-3">
                {field(`${kind}-kzt`, t("admin.reference.kzt"), "1")}
                {field(`${kind}-usd`, t("admin.reference.usd"), "0.01")}
              </div>
            </fieldset>
          ))}
        </div>
      </Card>
      <Card title={t("admin.reference.print")}>
        <p className="-mt-2 text-sm text-muted">{t("admin.reference.print.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("cover-soft", t("admin.reference.cover.soft"), "1")}
          {field("cover-hard", t("admin.reference.cover.hard"), "1")}
          {field("delivery", t("admin.reference.delivery"), "1")}
        </div>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

// ---- Cities ----------------------------------------------------------------------------------

const NAMES = ["ru", "kk", "en"] as const;
/** A city in the form, with a key that stays put while rows move. */
type CityDraft = City & { key: number };
let nextKey = 0;
const withKey = (city: City): CityDraft => ({ ...city, key: nextKey++ });

function CitiesTab({ initial }: { initial: City[] }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const [rows, setRows] = useState(() => initial.map(withKey));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (next: CityDraft[]) => {
      const parsed = CitiesSchema.safeParse(next.map(({ ru, kk, en, freeDelivery }) => ({ ru, kk, en, freeDelivery })));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCities(parsed.data) : null;
    },
    onSuccess: (cities) => {
      if (!cities) return;
      saved({ cities });
      setRows(cities.map(withKey));
    },
  });
  const update = (index: number, patch: Partial<City>) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: -1 | 1) =>
    setRows((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  // Problems point at row indexes: moving or removing rows makes them stale, so they are cleared.
  const reshape = (change: () => void) => {
    change();
    setProblems({});
  };

  return (
    <form
      data-testid="reference-cities"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.cities.hint")}</p>
        {problems[""] && <p className={errorText}>{t("admin.reference.error.citiesEmpty")}</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((city, i) => (
            <li key={city.key} data-testid="city-row" data-value={city.ru} className="flex flex-col gap-3 rounded-xl bg-background p-3 lg:flex-row lg:items-start">
              <span className="hidden w-6 pt-2 text-right text-sm font-bold text-muted lg:block">{i + 1}</span>
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                {NAMES.map((lang) => {
                  const problem = problems[`${i}.${lang}`];
                  return (
                    <label key={lang} className={label}>
                      <span className="text-xs text-muted">{t(`admin.reference.city.${lang}`)}</span>
                      <input
                        data-testid={`city-${lang}`}
                        value={city[lang]}
                        aria-invalid={!!problem}
                        onChange={(e) => update(i, { [lang]: e.target.value })}
                        className={`${input} aria-[invalid=true]:border-red-600`}
                      />
                      {problem && (
                        <span data-testid="reference-error" className={errorText}>
                          {t(problem === "custom" ? "admin.reference.error.cityDuplicate" : "admin.reference.error.cityName")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 lg:pt-6">
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <input type="checkbox" data-testid="city-free" checked={city.freeDelivery} onChange={(e) => update(i, { freeDelivery: e.target.checked })} />
                  {t("admin.reference.city.free")}
                </label>
                <div className="flex gap-1">
                  <IconButton testId="city-up" label={t("admin.reference.city.up")} disabled={i === 0} onClick={() => reshape(() => move(i, -1))}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton testId="city-down" label={t("admin.reference.city.down")} disabled={i === rows.length - 1} onClick={() => reshape(() => move(i, 1))}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton
                    testId="city-remove"
                    label={t("admin.reference.city.remove")}
                    onClick={() => reshape(() => setRows((list) => list.filter((_, j) => j !== i)))}
                    className="text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-testid="city-add"
          onClick={() => setRows((list) => [...list, withKey({ ru: "", kk: "", en: "", freeDelivery: false })])}
          className={`${ghostButton} flex items-center gap-2 self-start`}
        >
          <Plus className="size-4" />
          {t("admin.reference.city.add")}
        </button>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

function IconButton({ testId, label, disabled, onClick, className = "", children }: { testId: string; label: string; disabled?: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border border-border p-2 hover:border-accent disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}

// ---- Blocked countries -----------------------------------------------------------------------

/** Country names in the admin's language, falling back to `fallback` (the API's English name). */
function useCountryName() {
  const { locale } = useAdminI18n();
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([intlLocale(locale), "en"], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  return (code: string, fallback?: string) => {
    const name = names?.of(code);
    return name && name !== code ? name : (fallback ?? code);
  };
}

function BlockedTab({ initial }: { initial: BlockedCountries }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName();
  const queryClient = useQueryClient();
  const [extra, setExtra] = useState(initial.extra);
  const [code, setCode] = useState("");
  const [addError, setAddError] = useState<MessageKey | null>(null);
  const meta = new Set(initial.meta.map((c) => c.code));
  const save = useMutation({
    mutationFn: (next: string[]) => saveBlocked(next),
    onSuccess: (blocked) => {
      queryClient.setQueryData<AdminReference>(QUERY, (old) => (old ? { ...old, blocked } : old));
      setExtra(blocked.extra);
    },
  });
  const policyRefused = save.error instanceof ApiError && save.error.code === COUNTRY_POLICY_BLOCKED;

  const add = () => {
    const parsed = CountryCodeSchema.safeParse(code);
    if (!parsed.success) return setAddError("admin.reference.error.country");
    if (meta.has(parsed.data)) return setAddError("admin.reference.error.countryMeta");
    if (extra.includes(parsed.data)) return setAddError("admin.reference.error.countryDuplicate");
    setAddError(null);
    setExtra((list) => [...list, parsed.data]);
    setCode("");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title={t("admin.reference.meta.title", { count: initial.meta.length })} className="border-dashed">
        <div data-testid="blocked-meta" className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t("admin.reference.meta.text")}</p>
          <a href={initial.policyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start text-sm font-semibold text-accent">
            {t("admin.reference.meta.policy")}
            <ExternalLink className="size-3.5" />
          </a>
          <ul className="flex flex-wrap gap-2">
            {initial.meta.map((country) => (
              <li key={country.code} data-testid="blocked-meta-row" data-code={country.code} className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-sm">
                <span className="font-mono text-xs font-bold text-muted">{country.code}</span>
                {countryName(country.code, country.name)}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(extra);
        }}
        className="flex flex-col gap-4"
      >
        <Card title={t("admin.reference.extra.title")}>
          <div data-testid="blocked-extra" className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t("admin.reference.extra.text")}</p>
            {extra.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.reference.extra.empty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {extra.map((c) => (
                  <li key={c} data-testid="blocked-row" data-code={c} className="flex items-center gap-1.5 rounded-full bg-red-500/10 py-1 pr-1 pl-3 text-sm">
                    <span className="font-mono text-xs font-bold">{c}</span>
                    {countryName(c)}
                    <button
                      type="button"
                      data-testid="blocked-remove"
                      aria-label={t("admin.reference.extra.remove", { country: countryName(c) })}
                      title={t("admin.reference.extra.remove", { country: countryName(c) })}
                      onClick={() => setExtra((list) => list.filter((x) => x !== c))}
                      className="rounded-full p-1 hover:bg-red-500/20"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  data-testid="blocked-input"
                  value={code}
                  maxLength={2}
                  aria-label={t("admin.reference.extra.placeholder")}
                  placeholder={t("admin.reference.extra.placeholder")}
                  aria-invalid={!!addError}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setAddError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                  }}
                  className={`${input} max-w-xs font-mono uppercase placeholder:font-sans placeholder:normal-case aria-[invalid=true]:border-red-600`}
                />
                <button type="button" data-testid="blocked-add" onClick={add} className={`${ghostButton} flex shrink-0 items-center gap-2`}>
                  <Plus className="size-4" />
                  {t("admin.reference.extra.add")}
                </button>
              </div>
              {addError && (
                <span data-testid="reference-error" className={errorText}>
                  {t(addError)}
                </span>
              )}
            </div>
          </div>
        </Card>
        <SaveBar
          pending={save.isPending}
          saved={save.isSuccess}
          error={policyRefused ? new Error(t("admin.reference.error.countryMeta")) : save.error}
          problems={false}
        />
      </form>
    </div>
  );
}
