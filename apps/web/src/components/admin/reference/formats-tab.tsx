"use client";

import { useMutation } from "@tanstack/react-query";
import { BASE_LANGUAGES, FormatsSchema, LANGUAGES, LANGUAGE_NAMES, type Language, type LocalizedText, type PrintFormat } from "@fabulka/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MessageKey } from "@/i18n/messages";
import { saveFormats } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows, useSaved } from "./shared";

/** The number fields of a format, as typed: sizes in millimetres, prices in tenge. */
const NUMBERS = ["widthMm", "heightMm", "bleedMm", "safeMm", "soft", "hard"] as const;
type NumberField = (typeof NUMBERS)[number];

const LABELS: Record<NumberField, MessageKey> = {
  widthMm: "admin.reference.format.width",
  heightMm: "admin.reference.format.height",
  bleedMm: "admin.reference.format.bleed",
  safeMm: "admin.reference.format.safe",
  soft: "admin.reference.cover.soft",
  hard: "admin.reference.cover.hard",
};

/** Where each number sits in PrintFormat, for the problems the schema reports. */
const PATHS: Record<NumberField, string> = {
  widthMm: "widthMm",
  heightMm: "heightMm",
  bleedMm: "bleedMm",
  safeMm: "safeMm",
  soft: "prices.soft",
  hard: "prices.hard",
};

/** A format in the form: its id is typed for a new one and fixed once saved. */
type FormatDraft = { key: number; saved: boolean; id: string; name: LocalizedText; published: boolean } & Record<NumberField, string>;

const withKey = (f: PrintFormat): FormatDraft => ({
  key: nextKey(),
  saved: true,
  id: f.id,
  name: f.name,
  published: f.published,
  widthMm: String(f.widthMm),
  heightMm: String(f.heightMm),
  bleedMm: String(f.bleedMm),
  safeMm: String(f.safeMm),
  soft: String(f.prices.soft),
  hard: String(f.prices.hard),
});

/** "12,5" or "9 900" as typed; an empty field is not zero. */
const amount = (text: string) => (text.trim() ? Number(text.replace(/\s/g, "").replace(",", ".")) : Number.NaN);

const fromDrafts = (rows: FormatDraft[]) =>
  rows.map((row) => ({
    id: row.id.trim(),
    name: row.name,
    widthMm: amount(row.widthMm),
    heightMm: amount(row.heightMm),
    bleedMm: amount(row.bleedMm),
    safeMm: amount(row.safeMm),
    prices: { soft: amount(row.soft), hard: amount(row.hard) },
    published: row.published,
  }));

/**
 * Print formats: the page size, the bleed the printer trims off, the safe zone text stays inside and
 * the price of one copy by cover in tenge. The order form offers the published ones, in this order.
 */
export function FormatsTab({ initial }: { initial: PrintFormat[] }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => initial.map(withKey));
  const save = useMutation({
    mutationFn: async (next: FormatDraft[]) => {
      const parsed = FormatsSchema.safeParse(fromDrafts(next));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveFormats(parsed.data) : null;
    },
    onSuccess: (formats) => {
      if (!formats) return;
      saved({ formats });
      setRows(formats.map(withKey));
    },
  });

  return (
    <form
      data-testid="reference-formats"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.formats.hint")}</p>
        <ol className="flex flex-col gap-3">
          {rows.map((format, i) => (
            <li key={format.key} data-testid="format-row" data-id={format.id} className="flex flex-col gap-3 rounded-xl bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {format.saved ? (
                  <span data-testid="format-id" className="font-mono text-sm text-muted">
                    {format.id}
                  </span>
                ) : (
                  <Field label={t("admin.reference.format.id")} error={problems[`${i}.id`] && t("admin.reference.error.formatId")} errorTestId="reference-error">
                    <Input code data-testid="format-id-input" value={format.id} onChange={(e) => update(i, () => ({ id: e.target.value }))} />
                  </Field>
                )}
                <div className="flex items-center gap-3">
                  <ChoiceLabel className="whitespace-nowrap">
                    <Checkbox data-testid="format-published" checked={format.published} onChange={(e) => update(i, () => ({ published: e.target.checked }))} />
                    {t("admin.reference.format.published")}
                  </ChoiceLabel>
                  <RowActions
                    prefix="format"
                    index={i}
                    count={rows.length}
                    labels={{ up: t("admin.reference.city.up"), down: t("admin.reference.city.down"), remove: t("admin.reference.format.remove") }}
                    onMove={(by) => move(i, by)}
                    onRemove={() => remove(i)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {LANGUAGES.map((lang) => {
                  const base = (BASE_LANGUAGES as readonly Language[]).includes(lang);
                  return (
                    <Field
                      key={lang}
                      label={
                        <span className="text-xs text-muted">
                          {LANGUAGE_NAMES[lang]}
                          {!base && <span className="ml-1 font-normal">({t("admin.reference.faq.optional")})</span>}
                        </span>
                      }
                      error={problems[`${i}.name.${lang}`] && t("admin.reference.error.cityName")}
                      errorTestId="reference-error"
                    >
                      <Input
                        data-testid={`format-name-${lang}`}
                        value={format.name[lang] ?? ""}
                        onChange={(e) => update(i, (row) => ({ name: { ...row.name, [lang]: e.target.value } }))}
                      />
                    </Field>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {NUMBERS.map((field) => (
                  <Field
                    key={field}
                    label={<span className="text-xs text-muted">{t(LABELS[field])}</span>}
                    error={problems[`${i}.${PATHS[field]}`] && t(field === "soft" || field === "hard" ? "admin.reference.error.tenge" : "admin.reference.error.size")}
                    errorTestId="reference-error"
                  >
                    <Input
                      data-testid={`format-${field}`}
                      inputMode="decimal"
                      value={format[field]}
                      onChange={(e) => update(i, () => ({ [field]: e.target.value }) as Partial<FormatDraft>)}
                    />
                  </Field>
                ))}
              </div>
            </li>
          ))}
        </ol>
        {problems["0.published"] && <p className={errorText}>{t("admin.reference.error.formatPublished")}</p>}
        <Button
          variant="secondary"
          data-testid="format-add"
          icon={<Plus className="size-4" />}
          onClick={() =>
            setRows((list) => [
              ...list,
              { key: nextKey(), saved: false, id: "", name: {}, published: false, widthMm: "210", heightMm: "210", bleedMm: "3", safeMm: "12", soft: "", hard: "" },
            ])
          }
          className="self-start"
        >
          {t("admin.reference.format.add")}
        </Button>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}
