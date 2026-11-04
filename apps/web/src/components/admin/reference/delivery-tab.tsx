"use client";

import { useMutation } from "@/lib/query";
import { CURRENCIES, SCOPE_FORBIDDEN, countryInfo, money, toInputString, type AdminReference, type CountryDelivery, type Currency } from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { ApiError } from "@/lib/api";
import { clearDelivery, saveDelivery } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { parsePrice, SaveBar, useCurrencyLabel, useSaved } from "./shared";

const text = (amount: number | undefined, currency: Currency) => (amount === undefined ? "" : toInputString(money(amount, currency)));

/**
 * Delivery of printed copies. With "All countries": each currency's default fee (every country
 * charging in it without its own pays it). With a working country: its own fee in its currency,
 * whether delivery there is free to every city (else only to the cities marked free on the Cities
 * tab), and optionally what the print partner charges us for delivery (any currency, for margins).
 */
export function DeliveryTab({ reference, country }: { reference: AdminReference; country: string | null }) {
  const { t } = useAdminI18n();
  if (!country) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t("admin.reference.delivery.globalHint")}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {CURRENCIES.map((currency) => (
            <GlobalFee key={currency} reference={reference} currency={currency} />
          ))}
        </div>
      </div>
    );
  }
  return <CountryDeliveryForm reference={reference} country={country} />;
}

/** One currency's default delivery fee. */
function GlobalFee({ reference, currency }: { reference: AdminReference; currency: Currency }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const label = useCurrencyLabel();
  const [fee, setFee] = useState(text(reference.prices[currency]?.delivery, currency));
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const amount = parsePrice(fee, currency);
      setInvalid(amount === null);
      return amount === null ? null : saveDelivery(null, { currency, fee: amount, freeEverywhere: false });
    },
    onSuccess: (delivery) => {
      if (!delivery) return;
      const list = reference.prices[currency];
      saved({ prices: { ...reference.prices, [currency]: { books: list?.books ?? { template: 0, custom: 0 }, delivery: delivery.fee } } });
    },
  });
  return (
    <form
      data-testid="reference-delivery"
      data-country=""
      data-currency={currency}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <Card title={label(currency)}>
        <Field label={t("admin.reference.delivery")} error={invalid && t("admin.reference.error.fee", { currency })} errorTestId="reference-error">
          <Input data-testid="delivery-fee" inputMode={currency === "KZT" ? "numeric" : "decimal"} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
      </Card>
      <SaveBar testId={`delivery-save-${currency}`} pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={invalid} />
    </form>
  );
}

/** A country's own fee (its currency), free-everywhere rule and the partner's delivery cost. */
function CountryDeliveryForm({ reference, country }: { reference: AdminReference; country: string }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const label = useCurrencyLabel();
  const { currency, print } = countryInfo(country, reference.countries);
  const stored = reference.countryDelivery[country];
  const own = stored?.currency === currency ? stored : undefined;
  const [fee, setFee] = useState(text(own?.fee ?? reference.prices[currency]?.delivery, currency));
  const [freeEverywhere, setFreeEverywhere] = useState(own?.freeEverywhere ?? false);
  const [costCurrency, setCostCurrency] = useState<Currency>(stored?.cost?.currency ?? currency);
  const [cost, setCost] = useState(stored?.cost ? text(stored.cost.amount, stored.cost.currency) : "");
  const [invalid, setInvalid] = useState<{ fee?: boolean; cost?: boolean }>({});
  const save = useMutation({
    mutationFn: async () => {
      const amount = parsePrice(fee, currency);
      const costAmount = cost.trim() ? parsePrice(cost, costCurrency) : undefined;
      setInvalid({ fee: amount === null, cost: costAmount === null });
      if (amount === null || costAmount === null) return null;
      const body: CountryDelivery = {
        currency,
        fee: amount,
        freeEverywhere,
        ...(costAmount !== undefined && { cost: { amount: costAmount, currency: costCurrency } }),
      };
      return saveDelivery(country, body);
    },
    onSuccess: (delivery) => {
      if (delivery) saved({ countryDelivery: { ...reference.countryDelivery, [country]: delivery } });
    },
  });
  const reset = useMutation({
    mutationFn: () => clearDelivery(country),
    onSuccess: () => {
      const rest = { ...reference.countryDelivery };
      delete rest[country];
      saved({ countryDelivery: rest });
      setFee(text(reference.prices[currency]?.delivery, currency));
      setFreeEverywhere(false);
      setCost("");
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;

  return (
    <form
      data-testid="reference-delivery"
      data-country={country}
      data-currency={currency}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <Badge data-testid="delivery-own" data-own={own ? "true" : "false"} tone={own ? "success" : "neutral"} className="self-start">
        {own ? t("admin.reference.delivery.own") : t("admin.reference.delivery.usesGlobal")}
      </Badge>
      {!print && <Notice data-testid="delivery-no-print">{t("admin.reference.delivery.noPrint")}</Notice>}
      <Card title={t("admin.reference.print")}>
        <p className="-mt-2 text-sm text-muted">{t("admin.reference.delivery.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`${t("admin.reference.delivery")} · ${label(currency)}`} error={invalid.fee && t("admin.reference.error.fee", { currency })} errorTestId="reference-error">
            <Input data-testid="delivery-fee" inputMode={currency === "KZT" ? "numeric" : "decimal"} value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
        </div>
        <ChoiceLabel>
          <Checkbox data-testid="delivery-free-everywhere" checked={freeEverywhere} onChange={(e) => setFreeEverywhere(e.target.checked)} />
          {t("admin.reference.delivery.freeEverywhere")}
        </ChoiceLabel>
      </Card>
      <Card title={t("admin.reference.cost.title")}>
        <p className="-mt-2 text-sm text-muted">{t("admin.reference.cost.hint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("admin.reference.cost.delivery")} error={invalid.cost && t("admin.reference.error.fee", { currency: costCurrency })} errorTestId="reference-error">
            <Input data-testid="delivery-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label={t("admin.reference.cost.currency")}>
            <Select data-testid="delivery-cost-currency" value={costCurrency} onChange={(e) => setCostCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId="delivery-save" pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={Boolean(invalid.fee || invalid.cost)} />
        {stored && (
          <Button variant="ghost" data-testid="delivery-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.delivery.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
