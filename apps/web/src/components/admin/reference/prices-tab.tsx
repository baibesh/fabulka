"use client";

import { useMutation } from "@tanstack/react-query";
import { PricesSchema, SCOPE_FORBIDDEN, countryInfo, type AdminReference, type Prices } from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MessageKey } from "@/i18n/messages";
import { ApiError } from "@/lib/api";
import { clearCountryPrices, saveCountryPrices, savePrices } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { issuesByPath, SaveBar, useSaved } from "./shared";

/** Each price field: its test id, where it sits in Prices, its label and the message for a bad value. */
const PRICE_FIELDS = {
  "template-kzt": { path: "books.template.KZT", error: "admin.reference.error.tenge" },
  "template-usd": { path: "books.template.USD", error: "admin.reference.error.usd" },
  "custom-kzt": { path: "books.custom.KZT", error: "admin.reference.error.tenge" },
  "custom-usd": { path: "books.custom.USD", error: "admin.reference.error.usd" },
  delivery: { path: "deliveryKzt", error: "admin.reference.error.delivery" },
} satisfies Record<string, { path: string; error: MessageKey }>;
type PriceField = keyof typeof PRICE_FIELDS;
type PriceDraft = Record<PriceField, string>;

const toPriceDraft = (p: Prices): PriceDraft => ({
  "template-kzt": String(p.books.template.KZT),
  "template-usd": String(p.books.template.USD),
  "custom-kzt": String(p.books.custom.KZT),
  "custom-usd": String(p.books.custom.USD),
  delivery: String(p.deliveryKzt),
});

/** "1 900" or "3,9" as typed; an empty field is not zero. */
const amount = (text: string) => (text.trim() ? Number(text.replace(/\s/g, "").replace(",", ".")) : Number.NaN);

const fromPriceDraft = (d: PriceDraft): Prices => ({
  books: {
    template: { KZT: amount(d["template-kzt"]), USD: amount(d["template-usd"]) },
    custom: { KZT: amount(d["custom-kzt"]), USD: amount(d["custom-usd"]) },
  },
  deliveryKzt: amount(d.delivery),
});

/**
 * Prices of one more digital book: the global list (the working country "All countries"; every
 * country without its own) or the working country's own list, with a way back to the global one.
 */
export function PricesTab({ reference, country }: { reference: AdminReference; country: string | null }) {
  const { t } = useAdminI18n();
  return (
    <div className="flex flex-col gap-4">
      {country && (
        <Badge data-testid="prices-own" data-own={reference.countryPrices[country] ? "true" : "false"} tone={reference.countryPrices[country] ? "success" : "neutral"} className="self-start">
          {reference.countryPrices[country] ? t("admin.reference.prices.own") : t("admin.reference.prices.usesGlobal")}
        </Badge>
      )}
      <PricesForm reference={reference} country={country} />
    </div>
  );
}

/** Book prices in tenge and dollars and delivery of a printed copy (copies are priced on the «Форматы» tab). */
function PricesForm({ reference, country }: { reference: AdminReference; country: string | null }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const initial = (country && reference.countryPrices[country]) || reference.prices;
  const own = Boolean(country && reference.countryPrices[country]);
  // A country charges in one currency: only its fields matter there (the others keep their values).
  const currency = country ? countryInfo(country, reference.countries).currency : null;
  const [draft, setDraft] = useState(() => toPriceDraft(initial));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (next: PriceDraft) => {
      // Checked here with the API's own rules, so each problem shows next to its field.
      const parsed = PricesSchema.safeParse(fromPriceDraft(next));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      if (!parsed.success) return null;
      return country ? saveCountryPrices(country, parsed.data) : savePrices(parsed.data);
    },
    onSuccess: (prices) => {
      if (!prices) return;
      if (country) saved({ countryPrices: { ...reference.countryPrices, [country]: prices } });
      else saved({ prices });
      setDraft(toPriceDraft(prices));
    },
  });
  const reset = useMutation({
    mutationFn: () => clearCountryPrices(country!),
    onSuccess: () => {
      const rest = { ...reference.countryPrices };
      delete rest[country!];
      saved({ countryPrices: rest });
      setDraft(toPriceDraft(reference.prices));
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;

  const shown = (id: PriceField) => !currency || (id.endsWith("-kzt") ? currency === "KZT" : currency === "USD");
  const field = (id: PriceField, text: string, step: string) => shown(id) && (
    <Field label={text} error={problems[PRICE_FIELDS[id].path] && t(PRICE_FIELDS[id].error)} errorTestId="reference-error">
      <Input
        data-testid={`price-${id}`}
        inputMode={step === "1" ? "numeric" : "decimal"}
        value={draft[id]}
        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
      />
    </Field>
  );

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
              <div className={currency ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
                {field(`${kind}-kzt`, t("admin.reference.kzt"), "1")}
                {field(`${kind}-usd`, t("admin.reference.usd"), "0.01")}
              </div>
            </fieldset>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={Object.keys(problems).length > 0} />
        {own && (
          <Button variant="ghost" data-testid="prices-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.prices.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
