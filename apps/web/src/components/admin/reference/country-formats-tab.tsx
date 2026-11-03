"use client";

import { useMutation } from "@tanstack/react-query";
import { CountryFormatOverridesSchema, SCOPE_FORBIDDEN, formatName, type AdminReference, type CountryFormatOverrides } from "@fabulka/shared";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { clearCountryFormats, saveCountryFormats } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { SaveBar, useSaved } from "./shared";

/** One format in the form: offered or not, and its cover prices as typed (empty: the global price). */
type Draft = { published: boolean; soft: string; hard: string };

/** "9 900" as typed; an empty field means the global price. */
const amount = (text: string) => (text.trim() ? Number(text.replace(/\s/g, "")) : null);

/**
 * The working country's print formats: which of the global formats it offers and its cover prices
 * (in tenge). Sizes, bleed and ids are global (the superadmin's Formats tab with "All countries").
 */
export function CountryFormatsTab({ reference, country }: { reference: AdminReference; country: string }) {
  const { t, locale, kzt } = useAdminI18n();
  const saved = useSaved();
  const own = reference.countryFormats[country];
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      reference.formats.map((f) => {
        const o = own?.[f.id];
        return [f.id, { published: o?.published ?? f.published, soft: o?.prices ? String(o.prices.soft) : "", hard: o?.prices ? String(o.prices.hard) : "" }];
      }),
    ),
  );
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: async () => {
      // Only what differs from the global format is the country's own.
      const overrides: CountryFormatOverrides = {};
      for (const f of reference.formats) {
        const d = drafts[f.id];
        const soft = amount(d.soft);
        const hard = amount(d.hard);
        const entry: CountryFormatOverrides[string] = {};
        if (d.published !== f.published) entry.published = d.published;
        if (soft !== null || hard !== null) entry.prices = { soft: soft ?? f.prices.soft, hard: hard ?? f.prices.hard };
        if (Object.keys(entry).length) overrides[f.id] = entry;
      }
      const parsed = CountryFormatOverridesSchema.safeParse(overrides);
      setInvalid(!parsed.success);
      return parsed.success ? saveCountryFormats(country, parsed.data) : null;
    },
    onSuccess: (formats) => {
      if (formats) saved({ countryFormats: { ...reference.countryFormats, [country]: formats } });
    },
  });
  const reset = useMutation({
    mutationFn: () => clearCountryFormats(country),
    onSuccess: () => {
      const rest = { ...reference.countryFormats };
      delete rest[country];
      saved({ countryFormats: rest });
      setDrafts(Object.fromEntries(reference.formats.map((f) => [f.id, { published: f.published, soft: "", hard: "" }])));
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;
  const set = (id: string, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  return (
    <form
      data-testid="reference-country-formats"
      data-country={country}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <Badge data-testid="country-formats-own" data-own={own ? "true" : "false"} tone={own ? "success" : "neutral"} className="self-start">
        {own ? t("admin.reference.countryFormats.own") : t("admin.reference.countryFormats.global")}
      </Badge>
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.countryFormats.hint")}</p>
        <ul className="flex flex-col gap-3">
          {reference.formats.map((f) => (
            <li key={f.id} data-testid={`country-format-${f.id}`} className="grid items-end gap-3 rounded-xl bg-background p-3 sm:grid-cols-[1fr_8rem_8rem]">
              <ChoiceLabel strong>
                <Checkbox data-testid={`country-format-offered-${f.id}`} checked={drafts[f.id].published} onChange={(e) => set(f.id, { published: e.target.checked })} />
                {formatName(f, locale)}
                <span className="text-xs font-normal text-muted">
                  {f.widthMm}×{f.heightMm}
                </span>
              </ChoiceLabel>
              {(["soft", "hard"] as const).map((cover) => (
                <Field key={cover} label={t(cover === "soft" ? "admin.reference.cover.soft" : "admin.reference.cover.hard")}>
                  <Input
                    data-testid={`country-format-${cover}-${f.id}`}
                    inputMode="numeric"
                    placeholder={kzt(f.prices[cover])}
                    value={drafts[f.id][cover]}
                    onChange={(e) => set(f.id, { [cover]: e.target.value })}
                  />
                </Field>
              ))}
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId="country-formats-save" pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={invalid} />
        {own && (
          <Button variant="ghost" data-testid="country-formats-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.countryFormats.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
