"use client";

import { useMutation } from "@tanstack/react-query";
import {
  BASE_LANGUAGES,
  FAQ_PLACEHOLDERS,
  FaqSchema,
  LANGUAGES,
  LANGUAGE_NAMES,
  OTHER_COUNTRY,
  localized,
  type CountryEntry,
  type FaqItem,
  type Language,
  type LocalizedText,
} from "@fabulka/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Flag } from "@/components/flag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useCountryName } from "@/hooks/use-country-name";
import { saveFaq } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows, useSaved } from "./shared";

/** Who sees an entry: everyone, a choice of countries, or the countries with or without print. */
type Audience = "all" | "only" | "except" | "print" | "noPrint";
const AUDIENCES: Audience[] = ["all", "only", "except", "print", "noPrint"];
const byCountries = (audience: Audience) => audience === "only" || audience === "except";
/** An FAQ entry in the form: who sees it as one choice, and a key that stays put while rows move. */
type FaqDraft = { key: number; id: string; q: LocalizedText; a: LocalizedText; audience: Audience; countries: string[]; published: boolean };

const toFaqDraft = (item: FaqItem): FaqDraft => ({
  key: nextKey(),
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

/** The landing's questions and answers in every language, and who sees each one. */
export function FaqTab({ initial, countries }: { initial: FaqItem[]; countries: CountryEntry[] }) {
  const { t, locale } = useAdminI18n();
  const countryName = useCountryName("admin");
  const saved = useSaved();
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => initial.map(toFaqDraft));
  const [open, setOpen] = useState<Set<number>>(() => new Set());

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

  const setText = (index: number, field: "q" | "a", language: Language, text: string) =>
    update(index, (row) => ({ [field]: { ...row[field], [language]: text } }));
  const toggleCountry = (index: number, code: string) =>
    update(index, (row) => ({ countries: row.countries.includes(code) ? row.countries.filter((c) => c !== code) : [...row.countries, code] }));
  const add = () => {
    const row: FaqDraft = { key: nextKey(), id: `faq-${Date.now().toString(36)}`, q: {}, a: {}, audience: "all", countries: [], published: true };
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
          : t(row.audience === "only" ? "admin.reference.faq.only" : "admin.reference.faq.except", {
              countries: row.countries.map((code) => countryName(code)).join(", ") || "—",
            });

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
                    {!row.published && <Badge>{t("admin.reference.faq.draft")}</Badge>}
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-border p-3">
                    {LANGUAGES.map((language) => {
                      const base = (BASE_LANGUAGES as readonly Language[]).includes(language);
                      return (
                        <fieldset key={language} className="flex flex-col gap-2">
                          <legend className="mb-1 text-sm font-bold">
                            {LANGUAGE_NAMES[language]}
                            {!base && <span className="ml-2 text-xs font-normal text-muted">{t("admin.reference.faq.optional")}</span>}
                          </legend>
                          <Field
                            label={<span className="text-xs text-muted">{t("admin.reference.faq.question")}</span>}
                            error={problems[`${i}.q.${language}`] && t("admin.reference.error.faqQuestion")}
                            errorTestId="reference-error"
                          >
                            <Input data-testid={`faq-q-${language}`} value={row.q[language] ?? ""} onChange={(e) => setText(i, "q", language, e.target.value)} />
                          </Field>
                          <Field
                            label={<span className="text-xs text-muted">{t("admin.reference.faq.answer")}</span>}
                            error={problems[`${i}.a.${language}`] && t("admin.reference.error.faqAnswer")}
                            errorTestId="reference-error"
                          >
                            <Textarea data-testid={`faq-a-${language}`} value={row.a[language] ?? ""} rows={3} onChange={(e) => setText(i, "a", language, e.target.value)} />
                          </Field>
                        </fieldset>
                      );
                    })}
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {t("admin.reference.faq.audience")}
                        <Select
                          small
                          data-testid="faq-audience"
                          value={row.audience}
                          onChange={(e) => update(i, () => ({ audience: e.target.value as Audience }))}
                          className="w-auto"
                        >
                          {AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {t(`admin.reference.faq.audience.${audience}`)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      {byCountries(row.audience) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {choices.map((code) => (
                            <ChoiceLabel key={code}>
                              <Checkbox data-testid={`faq-country-${code}`} checked={row.countries.includes(code)} onChange={() => toggleCountry(i, code)} />
                              <Flag code={code} />
                              {countryName(code)}
                            </ChoiceLabel>
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
                      <ChoiceLabel>
                        <Checkbox data-testid="faq-published" checked={row.published} onChange={(e) => update(i, () => ({ published: e.target.checked }))} />
                        {t("admin.reference.faq.published")}
                      </ChoiceLabel>
                      <RowActions
                        prefix="faq"
                        index={i}
                        count={rows.length}
                        labels={{ up: t("admin.reference.country.up"), down: t("admin.reference.country.down"), remove: t("admin.reference.faq.remove") }}
                        onMove={(by) => move(i, by)}
                        onRemove={() => remove(i)}
                      />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        <Button variant="secondary" data-testid="faq-add" onClick={add} icon={<Plus className="size-4" />} className="self-start">
          {t("admin.reference.faq.add")}
        </Button>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}
