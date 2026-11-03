"use client";

import { useMutation } from "@tanstack/react-query";
import { CountryDeliverySchema, SCOPE_FORBIDDEN, countryInfo, type AdminReference } from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { ApiError } from "@/lib/api";
import { clearDelivery, saveDelivery } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { SaveBar, useSaved } from "./shared";

/** "1 500" as typed; an empty field is not zero. */
const amount = (text: string) => (text.trim() ? Number(text.replace(/\s/g, "")) : Number.NaN);

/**
 * Delivery of printed copies: the global fee (every country without its own) or the working
 * country's own fee and whether delivery there is free to every city (else only to the cities marked
 * free on the Cities tab). Print is priced in tenge.
 */
export function DeliveryTab({ reference, country }: { reference: AdminReference; country: string | null }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const own = country ? reference.countryDelivery[country] : undefined;
  const [fee, setFee] = useState(String(own?.feeKzt ?? reference.prices.deliveryKzt));
  const [freeEverywhere, setFreeEverywhere] = useState(own?.freeEverywhere ?? false);
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = CountryDeliverySchema.safeParse({ feeKzt: amount(fee), freeEverywhere: country ? freeEverywhere : false });
      setInvalid(!parsed.success);
      return parsed.success ? saveDelivery(country, parsed.data) : null;
    },
    onSuccess: (delivery) => {
      if (!delivery) return;
      if (country) saved({ countryDelivery: { ...reference.countryDelivery, [country]: delivery } });
      else saved({ prices: { ...reference.prices, deliveryKzt: delivery.feeKzt } });
    },
  });
  const reset = useMutation({
    mutationFn: () => clearDelivery(country!),
    onSuccess: () => {
      const rest = { ...reference.countryDelivery };
      delete rest[country!];
      saved({ countryDelivery: rest });
      setFee(String(reference.prices.deliveryKzt));
      setFreeEverywhere(false);
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;
  const print = country ? countryInfo(country, reference.countries).print : true;

  return (
    <form
      data-testid="reference-delivery"
      data-country={country ?? ""}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      {country && (
        <Badge data-testid="delivery-own" data-own={own ? "true" : "false"} tone={own ? "success" : "neutral"} className="self-start">
          {own ? t("admin.reference.delivery.own") : t("admin.reference.delivery.usesGlobal")}
        </Badge>
      )}
      {!print && <Notice data-testid="delivery-no-print">{t("admin.reference.delivery.noPrint")}</Notice>}
      <Card title={t("admin.reference.print")}>
        <p className="-mt-2 text-sm text-muted">{country ? t("admin.reference.delivery.hint") : t("admin.reference.delivery.globalHint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("admin.reference.delivery")} error={invalid && t("admin.reference.error.delivery")} errorTestId="reference-error">
            <Input data-testid="delivery-fee" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
        </div>
        {country && (
          <ChoiceLabel>
            <Checkbox data-testid="delivery-free-everywhere" checked={freeEverywhere} onChange={(e) => setFreeEverywhere(e.target.checked)} />
            {t("admin.reference.delivery.freeEverywhere")}
          </ChoiceLabel>
        )}
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId="delivery-save" pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={invalid} />
        {own && (
          <Button variant="ghost" data-testid="delivery-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.delivery.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
