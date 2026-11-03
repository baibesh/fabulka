"use client";

import { useMutation } from "@tanstack/react-query";
import { CURRENCIES, SCOPE_FORBIDDEN, countryInfo, money, toInputString, type AdminReference, type BookKind, type BookPrices, type Currency } from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { ApiError } from "@/lib/api";
import { clearCountryPrices, saveCountryPrices, savePrices } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { SaveBar, useCurrencyLabel, usePriceError, parsePrice, useSaved } from "./shared";

const KINDS: BookKind[] = ["template", "custom"];

/**
 * Prices of one more digital book. With "All countries": the default list of each currency (every
 * country charging in it without its own pays it). With a working country: that country's own
 * prices, in its currency only, with a way back to its currency's default.
 */
export function PricesTab({ reference, country }: { reference: AdminReference; country: string | null }) {
  const { t } = useAdminI18n();
  if (!country) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("admin.reference.books.hint")}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {CURRENCIES.map((currency) => (
            <PricesForm key={currency} reference={reference} country={null} currency={currency} />
          ))}
        </div>
      </div>
    );
  }
  const currency = countryInfo(country, reference.countries).currency;
  const own = reference.countryPrices[country];
  const ownHere = own?.currency === currency;
  return (
    <div className="flex flex-col gap-4">
      <Badge data-testid="prices-own" data-own={ownHere ? "true" : "false"} tone={ownHere ? "success" : "neutral"} className="self-start">
        {ownHere ? t("admin.reference.prices.own") : t("admin.reference.prices.usesGlobal")}
      </Badge>
      {own && !ownHere && (
        <Notice data-testid="prices-other-currency">{t("admin.reference.prices.otherCurrency", { saved: own.currency, currency })}</Notice>
      )}
      <PricesForm reference={reference} country={country} currency={currency} />
    </div>
  );
}

/** Book prices in one currency: a currency's default list, or a country's own (in its currency). */
function PricesForm({ reference, country, currency }: { reference: AdminReference; country: string | null; currency: Currency }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const label = useCurrencyLabel();
  const priceError = usePriceError();
  const own = country ? reference.countryPrices[country] : undefined;
  const ownHere = own?.currency === currency ? own : undefined;
  const initial = ownHere?.books ?? reference.prices[currency]?.books;
  const text = (amount: number | undefined) => (amount === undefined ? "" : toInputString(money(amount, currency)));
  const [draft, setDraft] = useState<Record<BookKind, string>>(() => ({ template: text(initial?.template), custom: text(initial?.custom) }));
  const [problems, setProblems] = useState<Partial<Record<BookKind, boolean>>>({});
  const save = useMutation({
    mutationFn: async () => {
      // Each price parsed in the currency's units (whole tenge, cents), positive.
      const template = parsePrice(draft.template, currency, 1);
      const custom = parsePrice(draft.custom, currency, 1);
      setProblems({ template: template === null, custom: custom === null });
      if (template === null || custom === null) return null;
      const body: BookPrices = { currency, books: { template, custom } };
      return country ? saveCountryPrices(country, body) : savePrices(body);
    },
    onSuccess: (prices) => {
      if (!prices) return;
      if (country) saved({ countryPrices: { ...reference.countryPrices, [country]: prices } });
      else {
        const list = reference.prices[currency];
        saved({ prices: { ...reference.prices, [currency]: { books: prices.books, delivery: list?.delivery ?? 0 } } });
      }
      setDraft({ template: text(prices.books.template), custom: text(prices.books.custom) });
    },
  });
  const reset = useMutation({
    mutationFn: () => clearCountryPrices(country!),
    onSuccess: () => {
      const rest = { ...reference.countryPrices };
      delete rest[country!];
      saved({ countryPrices: rest });
      const books = reference.prices[currency]?.books;
      setDraft({ template: text(books?.template), custom: text(books?.custom) });
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;

  return (
    <form
      data-testid="reference-prices"
      data-currency={currency}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <Card title={country ? t("admin.reference.prices.in", { currency: label(currency) }) : t("admin.reference.prices.currency", { currency: label(currency) })}>
        {!country && <p className="-mt-2 text-sm text-muted">{t("admin.reference.prices.currencyHint", { code: currency })}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((kind) => (
            <Field key={kind} label={t(`admin.reference.kind.${kind}`)} error={problems[kind] && priceError(currency)} errorTestId="reference-error">
              <Input
                data-testid={`price-${kind}`}
                inputMode={currency === "KZT" ? "numeric" : "decimal"}
                value={draft[kind]}
                onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId={country ? "reference-save" : `prices-save-${currency}`} pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={Object.values(problems).some(Boolean)} />
        {ownHere && (
          <Button variant="ghost" data-testid="prices-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.prices.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
