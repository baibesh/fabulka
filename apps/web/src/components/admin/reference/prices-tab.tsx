"use client";

import { useMutation } from "@tanstack/react-query";
import { PricesSchema, type Prices } from "@fabulka/shared";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MessageKey } from "@/i18n/messages";
import { savePrices } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { issuesByPath, SaveBar, useSaved } from "./shared";

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

/** Book prices in tenge and dollars, the covers and delivery of a printed copy. */
export function PricesTab({ initial }: { initial: Prices }) {
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

  const field = (id: PriceField, text: string, step: string) => (
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
