"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  COUNTRY_BLOCKED,
  COUNTRY_POLICY_BLOCKED,
  CURRENCIES,
  CitiesSchema,
  CountriesSchema,
  CountryCodeSchema,
  BASE_LANGUAGES,
  FAQ_PLACEHOLDERS,
  FaqSchema,
  ISO_COUNTRY_CODES,
  LANGUAGES,
  LANGUAGE_NAMES,
  OTHER_COUNTRY,
  PricesSchema,
  cityId,
  localized,
  type AdminReference,
  type BlockedCountries,
  type City,
  type CountryEntry,
  type FaqItem,
  type Language,
  type LocalizedText,
  type Prices,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { intlLocale } from "@/i18n/format";
import type { MessageKey } from "@/i18n/messages";
import { adminReference, saveBlocked, saveCities, saveCountries, saveFaq, savePrices } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { useCountryName } from "@/hooks/use-country-name";
import { languageCode } from "@/lib/regions";
import { Flag } from "../flag";
import { button, Card, ghostButton, input, PageTitle, useAdminI18n } from "./ui";

const TABS = ["prices", "countries", "faq", "cities", "blocked"] as const;
type Tab = (typeof TABS)[number];

const label = "flex flex-col gap-1.5 text-sm font-semibold";
const errorText = "text-sm font-normal text-danger";
const QUERY = ["admin", "reference"];

/** /admin/reference: prices, countries, the landing's FAQ, delivery cities and blocked countries, edited without touching code. */
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
      {reference.isError && <p role="alert" className="text-danger">{reference.error.message}</p>}
      {!reference.data ? (
        !reference.isError && <p className="text-muted">{t("admin.loading")}</p>
      ) : tab === "prices" ? (
        <PricesTab initial={reference.data.prices} />
      ) : tab === "countries" ? (
        <CountriesTab initial={reference.data.countries} blocked={reference.data.blocked} />
      ) : tab === "faq" ? (
        <FaqTab initial={reference.data.faq} countries={reference.data.countries} />
      ) : tab === "cities" ? (
        <CitiesTab initial={reference.data.cities} />
      ) : (
        <BlockedTab initial={reference.data.blocked} />
      )}
    </>
  );
}

/** Puts a saved part into the admin's copy and makes the site load the new prices, countries and cities. */
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
        <span data-testid="reference-saved" className="text-sm text-success">
          {t("admin.saved")}
        </span>
      )}
      {problems && (
        <span role="alert" data-testid="reference-problems" className="text-sm text-danger">
          {t("admin.reference.check")}
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-danger">
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
          className={`${input} aria-[invalid=true]:border-danger`}
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

// ---- Countries -------------------------------------------------------------------------------

/** A country in the form, with a key that stays put while rows move. */
type CountryDraft = CountryEntry & { key: number };
const withCountryKey = (country: CountryEntry): CountryDraft => ({ ...country, key: nextKey++ });

function CountriesTab({ initial, blocked }: { initial: CountryEntry[]; blocked: BlockedCountries }) {
  const { t, locale } = useAdminI18n();
  const countryName = useCountryName("admin");
  const saved = useSaved();
  const [rows, setRows] = useState(() => initial.map(withCountryKey));
  const [pick, setPick] = useState("");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const meta = new Set(blocked.meta.map((c) => c.code));
  const extra = new Set(blocked.extra);
  // Only countries that may be offered: never one on Meta's list or the owner's.
  const available = ISO_COUNTRY_CODES.filter((code) => !meta.has(code) && !extra.has(code) && !rows.some((row) => row.code === code))
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, intlLocale(locale)));
  const save = useMutation({
    mutationFn: async (next: CountryDraft[]) => {
      const parsed = CountriesSchema.safeParse(next.map(({ code, languages, currency, print }) => ({ code, languages, currency, print })));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCountries(parsed.data) : null;
    },
    onSuccess: (countries) => {
      if (!countries) return;
      saved({ countries });
      setRows(countries.map(withCountryKey));
    },
  });
  const refused = save.error instanceof ApiError ? save.error.code : null;
  const saveError =
    refused === COUNTRY_POLICY_BLOCKED
      ? new Error(t("admin.reference.error.countryMeta"))
      : refused === COUNTRY_BLOCKED
        ? new Error(t("admin.reference.error.countryBlocked"))
        : save.error;

  const update = (index: number, patch: (row: CountryDraft) => Partial<CountryEntry>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch(row) } : row)));
  const toggleLanguage = (index: number, language: Language) =>
    update(index, (row) => ({
      languages: row.languages.includes(language) ? row.languages.filter((l) => l !== language) : [...row.languages, language],
    }));
  const makeDefault = (index: number, language: Language) =>
    update(index, (row) => ({ languages: [language, ...row.languages.filter((l) => l !== language)] }));
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
  const add = () => {
    if (!pick) return;
    setRows((list) => [...list, withCountryKey({ code: pick, languages: ["ru", "en"], currency: "USD", print: false })]);
    setPick("");
  };

  return (
    <form
      data-testid="reference-countries"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.countries.hint")}</p>
        {problems[""] && <p className={errorText}>{t("admin.reference.error.countriesEmpty")}</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((country, i) => {
            const name = countryName(country.code);
            const isBlocked = meta.has(country.code) || extra.has(country.code);
            return (
              <li key={country.key} data-testid="country-row" data-code={country.code} className="flex flex-col gap-3 rounded-xl bg-background p-3 lg:flex-row lg:items-center">
                <span className="hidden w-6 text-right text-sm font-bold text-muted lg:block">{i + 1}</span>
                <div className="flex min-w-48 items-center gap-2 font-semibold">
                  <Flag code={country.code} className="text-lg" />
                  <span>{name}</span>
                  <span className="font-mono text-xs font-bold text-muted">{country.code}</span>
                </div>
                <fieldset className="flex flex-1 flex-col gap-1">
                  <legend className="sr-only">{t("admin.reference.country.languages")}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {LANGUAGES.map((language) => {
                      const on = country.languages.includes(language);
                      const isDefault = country.languages[0] === language;
                      return (
                        <span key={language} className="flex items-center gap-1.5 text-sm">
                          {/* Short codes keep all five languages on one line; the full name is the hint. */}
                          <label className="flex items-center gap-1.5 font-semibold" title={LANGUAGE_NAMES[language]}>
                            <input
                              type="checkbox"
                              data-testid={`country-lang-${language}`}
                              aria-label={LANGUAGE_NAMES[language]}
                              checked={on}
                              onChange={() => toggleLanguage(i, language)}
                            />
                            {languageCode(language)}
                          </label>
                          <input
                            type="radio"
                            name={`country-default-${country.key}`}
                            data-testid={`country-default-${language}`}
                            aria-label={t("admin.reference.country.makeDefault", { language: LANGUAGE_NAMES[language] })}
                            title={t("admin.reference.country.makeDefault", { language: LANGUAGE_NAMES[language] })}
                            checked={isDefault}
                            disabled={!on}
                            onChange={() => makeDefault(i, language)}
                          />
                          {isDefault && <span className="text-xs text-muted">{t("admin.reference.country.default")}</span>}
                        </span>
                      );
                    })}
                  </div>
                  {problems[`${i}.languages`] && (
                    <span data-testid="reference-error" className={errorText}>
                      {t("admin.reference.error.languages")}
                    </span>
                  )}
                  {isBlocked && (
                    <span data-testid="country-blocked" className="text-xs font-semibold text-danger">
                      {t("admin.reference.country.blocked")}
                    </span>
                  )}
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">{t("admin.reference.country.currency")}</span>
                    <select
                      data-testid="country-currency"
                      value={country.currency}
                      onChange={(e) => update(i, () => ({ currency: e.target.value as CountryEntry["currency"] }))}
                      className="rounded-lg border border-border bg-card px-2 py-1"
                    >
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input type="checkbox" data-testid="country-print" checked={country.print} onChange={(e) => update(i, () => ({ print: e.target.checked }))} />
                      {t("admin.reference.country.print")}
                    </label>
                    {/* Print is priced in tenge: offered only where the country pays in tenge. */}
                    {problems[`${i}.print`] && (
                      <span data-testid="reference-error" className={`${errorText} max-w-56`}>
                        {t("admin.reference.error.printCurrency")}
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <IconButton testId="country-up" label={t("admin.reference.country.up")} disabled={i === 0} onClick={() => reshape(() => move(i, -1))}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton testId="country-down" label={t("admin.reference.country.down")} disabled={i === rows.length - 1} onClick={() => reshape(() => move(i, 1))}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      testId="country-remove"
                      label={t("admin.reference.country.remove", { country: name })}
                      onClick={() => reshape(() => setRows((list) => list.filter((_, j) => j !== i)))}
                      className="text-danger"
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
          <li data-testid="country-other" className="flex flex-col gap-1 rounded-xl border border-dashed border-border p-3 lg:flex-row lg:items-center lg:gap-3">
            <span className="hidden w-6 lg:block" />
            <div className="flex min-w-48 items-center gap-2 font-semibold">
              <Flag code="other" className="text-lg" />
              {t("admin.reference.other.title")}
            </div>
            <p className="text-sm text-muted">{t("admin.reference.other.text")}</p>
          </li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            data-testid="country-add-select"
            aria-label={t("admin.reference.country.pick")}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className={`${input} max-w-sm`}
          >
            <option value="">{t("admin.reference.country.pick")}</option>
            {available.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.code})
              </option>
            ))}
          </select>
          <button type="button" data-testid="country-add" disabled={!pick} onClick={add} className={`${ghostButton} flex shrink-0 items-center gap-2 self-start disabled:opacity-40`}>
            <Plus className="size-4" />
            {t("admin.reference.country.add")}
          </button>
        </div>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={saveError} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

// ---- FAQ -------------------------------------------------------------------------------------

/** Who sees an entry: everyone, a choice of countries, or the countries with or without print. */
type Audience = "all" | "only" | "except" | "print" | "noPrint";
const AUDIENCES: Audience[] = ["all", "only", "except", "print", "noPrint"];
const byCountries = (audience: Audience) => audience === "only" || audience === "except";
/** An FAQ entry in the form: who sees it as one choice, and a key that stays put while rows move. */
type FaqDraft = { key: number; id: string; q: LocalizedText; a: LocalizedText; audience: Audience; countries: string[]; published: boolean };

const toFaqDraft = (item: FaqItem): FaqDraft => ({
  key: nextKey++,
  id: item.id,
  q: item.q,
  a: item.a,
  audience:
    item.print === "with" ? "print" : item.print === "without" ? "noPrint" : item.countries.length === 0 ? "all" : item.excludeCountries ? "except" : "only",
  countries: item.countries,
  published: item.published,
});

const fromFaqDraft = (d: FaqDraft) => ({
  id: d.id,
  q: d.q,
  a: d.a,
  countries: byCountries(d.audience) ? d.countries : [],
  excludeCountries: d.audience === "except",
  ...(d.audience === "print" ? { print: "with" as const } : d.audience === "noPrint" ? { print: "without" as const } : {}),
  published: d.published,
});

function FaqTab({ initial, countries }: { initial: FaqItem[]; countries: CountryEntry[] }) {
  const { t, locale } = useAdminI18n();
  const countryName = useCountryName("admin");
  const saved = useSaved();
  const [rows, setRows] = useState(() => initial.map(toFaqDraft));
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [problems, setProblems] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (next: FaqDraft[]) => {
      const parsed = FaqSchema.safeParse(next.map(fromFaqDraft));
      const found = parsed.success ? {} : issuesByPath(parsed.error.issues);
      // "Only in" with nothing picked would read as everywhere: asked for instead.
      next.forEach((row, i) => {
        if (row.audience === "only" && row.countries.length === 0) found[`${i}.countries`] = "custom";
      });
      setProblems(found);
      if (Object.keys(found).length) {
        // Entries with a problem open, so it can be seen.
        const bad = new Set(Object.keys(found).map((path) => Number(path.split(".")[0])));
        setOpen((keys) => new Set([...keys, ...next.filter((_, i) => bad.has(i)).map((row) => row.key)]));
        return null;
      }
      return parsed.success ? saveFaq(parsed.data) : null;
    },
    onSuccess: (faq) => {
      if (!faq) return;
      saved({ faq });
      setRows(faq.map(toFaqDraft));
      setOpen(new Set());
    },
  });

  const update = (index: number, patch: (row: FaqDraft) => Partial<FaqDraft>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch(row) } : row)));
  const setText = (index: number, field: "q" | "a", language: Language, text: string) =>
    update(index, (row) => ({ [field]: { ...row[field], [language]: text } }));
  const toggleCountry = (index: number, code: string) =>
    update(index, (row) => ({ countries: row.countries.includes(code) ? row.countries.filter((c) => c !== code) : [...row.countries, code] }));
  const move = (index: number, by: -1 | 1) =>
    setRows((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const reshape = (change: () => void) => {
    change();
    setProblems({});
  };
  const add = () => {
    const row: FaqDraft = { key: nextKey++, id: `faq-${Date.now().toString(36)}`, q: {}, a: {}, audience: "all", countries: [], published: true };
    setRows((list) => [...list, row]);
    setOpen((keys) => new Set([...keys, row.key]));
  };
  const summary = (row: FaqDraft) =>
    row.audience === "all"
      ? t("admin.reference.faq.everywhere")
      : row.audience === "print"
        ? t("admin.reference.faq.withPrint")
        : row.audience === "noPrint"
          ? t("admin.reference.faq.withoutPrint")
          : t(row.audience === "only" ? "admin.reference.faq.only" : "admin.reference.faq.except", { countries: row.countries.map((code) => countryName(code)).join(", ") || "—" });

  return (
    <form
      data-testid="reference-faq"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">
          {t("admin.reference.faq.hint", { placeholders: FAQ_PLACEHOLDERS.map((name) => `{${name}}`).join(", ") })}
        </p>
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => {
            // Every listed country and "other", plus any picked earlier and since taken off the list.
            const choices = [...countries.map((c) => c.code), OTHER_COUNTRY, ...row.countries.filter((c) => c !== OTHER_COUNTRY && !countries.some((x) => x.code === c))];
            return (
              <li key={row.key} data-testid="faq-row" data-id={row.id} className="rounded-xl bg-background">
                <details
                  open={open.has(row.key)}
                  onToggle={(e) => {
                    const isOpen = e.currentTarget.open;
                    setOpen((keys) => {
                      const next = new Set(keys);
                      if (isOpen) next.add(row.key);
                      else next.delete(row.key);
                      return next;
                    });
                  }}
                >
                  <summary data-testid="faq-toggle" className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-3 [&::-webkit-details-marker]:hidden">
                    <span className="w-6 text-right text-sm font-bold text-muted">{i + 1}</span>
                    <span className="flex-1 font-semibold">{localized(row.q, locale) || t("admin.reference.faq.untitled")}</span>
                    <span className="text-xs text-muted">{summary(row)}</span>
                    {!row.published && <span className="rounded-full bg-border px-2 py-0.5 text-xs font-bold text-muted">{t("admin.reference.faq.draft")}</span>}
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-border p-3">
                    {LANGUAGES.map((language) => {
                      const base = (BASE_LANGUAGES as readonly Language[]).includes(language);
                      const qProblem = problems[`${i}.q.${language}`];
                      const aProblem = problems[`${i}.a.${language}`];
                      return (
                        <fieldset key={language} className="flex flex-col gap-2">
                          <legend className="mb-1 text-sm font-bold">
                            {LANGUAGE_NAMES[language]}
                            {!base && <span className="ml-2 text-xs font-normal text-muted">{t("admin.reference.faq.optional")}</span>}
                          </legend>
                          <label className={label}>
                            <span className="text-xs text-muted">{t("admin.reference.faq.question")}</span>
                            <input
                              data-testid={`faq-q-${language}`}
                              value={row.q[language] ?? ""}
                              aria-invalid={!!qProblem}
                              onChange={(e) => setText(i, "q", language, e.target.value)}
                              className={`${input} aria-[invalid=true]:border-danger`}
                            />
                            {qProblem && (
                              <span data-testid="reference-error" className={errorText}>
                                {t("admin.reference.error.faqQuestion")}
                              </span>
                            )}
                          </label>
                          <label className={label}>
                            <span className="text-xs text-muted">{t("admin.reference.faq.answer")}</span>
                            <textarea
                              data-testid={`faq-a-${language}`}
                              value={row.a[language] ?? ""}
                              rows={3}
                              aria-invalid={!!aProblem}
                              onChange={(e) => setText(i, "a", language, e.target.value)}
                              className={`${input} font-normal aria-[invalid=true]:border-danger`}
                            />
                            {aProblem && (
                              <span data-testid="reference-error" className={errorText}>
                                {t("admin.reference.error.faqAnswer")}
                              </span>
                            )}
                          </label>
                        </fieldset>
                      );
                    })}
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {t("admin.reference.faq.audience")}
                        <select
                          data-testid="faq-audience"
                          value={row.audience}
                          onChange={(e) => update(i, () => ({ audience: e.target.value as Audience }))}
                          className="rounded-lg border border-border bg-card px-2 py-1 font-normal"
                        >
                          {AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {t(`admin.reference.faq.audience.${audience}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {byCountries(row.audience) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {choices.map((code) => (
                            <label key={code} className="flex items-center gap-1.5 text-sm">
                              <input type="checkbox" data-testid={`faq-country-${code}`} checked={row.countries.includes(code)} onChange={() => toggleCountry(i, code)} />
                              <Flag code={code} />
                              {countryName(code)}
                            </label>
                          ))}
                        </div>
                      )}
                      {problems[`${i}.countries`] && (
                        <span data-testid="reference-error" className={errorText}>
                          {t("admin.reference.error.faqCountries")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" data-testid="faq-published" checked={row.published} onChange={(e) => update(i, () => ({ published: e.target.checked }))} />
                        {t("admin.reference.faq.published")}
                      </label>
                      <div className="flex gap-1">
                        <IconButton testId="faq-up" label={t("admin.reference.country.up")} disabled={i === 0} onClick={() => reshape(() => move(i, -1))}>
                          <ArrowUp className="size-4" />
                        </IconButton>
                        <IconButton testId="faq-down" label={t("admin.reference.country.down")} disabled={i === rows.length - 1} onClick={() => reshape(() => move(i, 1))}>
                          <ArrowDown className="size-4" />
                        </IconButton>
                        <IconButton
                          testId="faq-remove"
                          label={t("admin.reference.faq.remove")}
                          onClick={() => reshape(() => setRows((list) => list.filter((_, j) => j !== i)))}
                          className="text-danger"
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        <button type="button" data-testid="faq-add" onClick={add} className={`${ghostButton} flex items-center gap-2 self-start`}>
          <Plus className="size-4" />
          {t("admin.reference.faq.add")}
        </button>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

// ---- Cities ----------------------------------------------------------------------------------

/** A city in the form, with a key that stays put while rows move; a new one has no id until saved. */
type CityDraft = { key: number; id: string; name: LocalizedText; freeDelivery: boolean };
let nextKey = 0;
const withKey = (city: City): CityDraft => ({ ...city, key: nextKey++ });

/** The cities to save: a new city gets an id from its Russian (else English) name, unique in the list. */
const fromCityDrafts = (rows: CityDraft[]) => {
  const taken = rows.map((row) => row.id).filter(Boolean);
  return rows.map(({ id, name, freeDelivery }) => {
    if (id) return { id, name, freeDelivery };
    const made = cityId(name.ru || name.en || "", taken);
    taken.push(made);
    return { id: made, name, freeDelivery };
  });
};

function CitiesTab({ initial }: { initial: City[] }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const [rows, setRows] = useState(() => initial.map(withKey));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (next: CityDraft[]) => {
      const parsed = CitiesSchema.safeParse(fromCityDrafts(next));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCities(parsed.data) : null;
    },
    onSuccess: (cities) => {
      if (!cities) return;
      saved({ cities });
      setRows(cities.map(withKey));
    },
  });
  const update = (index: number, patch: (row: CityDraft) => Partial<CityDraft>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch(row) } : row)));
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
            <li key={city.key} data-testid="city-row" data-id={city.id} className="flex flex-col gap-3 rounded-xl bg-background p-3 lg:flex-row lg:items-start">
              <span className="hidden w-6 pt-2 text-right text-sm font-bold text-muted lg:block">{i + 1}</span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {LANGUAGES.map((lang) => {
                    const problem = problems[`${i}.name.${lang}`];
                    const base = (BASE_LANGUAGES as readonly Language[]).includes(lang);
                    return (
                      <label key={lang} className={label}>
                        <span className="text-xs text-muted">
                          {LANGUAGE_NAMES[lang]}
                          {!base && <span className="ml-1 font-normal">({t("admin.reference.faq.optional")})</span>}
                        </span>
                        <input
                          data-testid={`city-${lang}`}
                          value={city.name[lang] ?? ""}
                          aria-invalid={!!problem}
                          onChange={(e) => update(i, (row) => ({ name: { ...row.name, [lang]: e.target.value } }))}
                          className={`${input} aria-[invalid=true]:border-danger`}
                        />
                        {problem && (
                          <span data-testid="reference-error" className={errorText}>
                            {t(problem === "custom" && lang === "ru" && city.name.ru ? "admin.reference.error.cityDuplicate" : "admin.reference.error.cityName")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {/* Orders refer to the city by this id: made from the name on the first save, then kept. */}
                {city.id && <span data-testid="city-id" className="font-mono text-xs text-muted">{city.id}</span>}
                {problems[`${i}.id`] && (
                  <span data-testid="reference-error" className={errorText}>
                    {t("admin.reference.error.cityDuplicate")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 lg:pt-6">
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <input type="checkbox" data-testid="city-free" checked={city.freeDelivery} onChange={(e) => update(i, () => ({ freeDelivery: e.target.checked }))} />
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
                    className="text-danger"
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
          onClick={() => setRows((list) => [...list, { key: nextKey++, id: "", name: {}, freeDelivery: false }])}
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

function BlockedTab({ initial }: { initial: BlockedCountries }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
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
                  <li key={c} data-testid="blocked-row" data-code={c} className="flex items-center gap-1.5 rounded-full bg-danger/10 py-1 pr-1 pl-3 text-sm">
                    <span className="font-mono text-xs font-bold">{c}</span>
                    {countryName(c)}
                    <button
                      type="button"
                      data-testid="blocked-remove"
                      aria-label={t("admin.reference.extra.remove", { country: countryName(c) })}
                      title={t("admin.reference.extra.remove", { country: countryName(c) })}
                      onClick={() => setExtra((list) => list.filter((x) => x !== c))}
                      className="rounded-full p-1 hover:bg-danger/20"
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
                  className={`${input} max-w-xs font-mono uppercase placeholder:font-sans placeholder:normal-case aria-[invalid=true]:border-danger`}
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
