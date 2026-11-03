"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CountryLandingSchema,
  LANDING_SECTIONS,
  LANGUAGE_NAMES,
  SCOPE_FORBIDDEN,
  countryInfo,
  faqFor,
  inLanguageOrder,
  localized,
  type AdminReference,
  type CountryFaqItem,
  type CountryLanding,
  type Language,
} from "@fabulka/shared";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { MESSAGES } from "@/i18n/messages";
import { ApiError } from "@/lib/api";
import { clearLanding, saveLanding } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { SaveBar, useSaved } from "./shared";

const EMPTY: CountryLanding = { hero: {}, faqHidden: [], faq: [], hiddenSections: [] };

/**
 * A country's landing: the hero's title and lead in each of its languages, which shared questions
 * it shows and the ones of its own, and which sections it leaves out. Whatever is left empty falls
 * back to the language defaults. SEO titles and descriptions are not here (the SEO section, per
 * language). The working country's, picked in the admin's switcher.
 */
export function LandingTab({ reference, country }: { reference: AdminReference; country: string }) {
  const { t } = useAdminI18n();
  const own = reference.landing[country];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge data-testid="landing-own" data-own={own ? "true" : "false"} tone={own ? "success" : "neutral"}>
          {own ? t("admin.reference.landing.own") : t("admin.reference.landing.defaults")}
        </Badge>
      </div>
      <p className="max-w-3xl text-sm text-muted">{t("admin.reference.landing.hint")}</p>
      <LandingForm reference={reference} country={country} />
    </div>
  );
}

function LandingForm({ reference, country }: { reference: AdminReference; country: string }) {
  const { t, locale } = useAdminI18n();
  const saved = useSaved();
  const info = countryInfo(country, reference.countries);
  const languages = inLanguageOrder(info.languages);
  const [draft, setDraft] = useState<CountryLanding>(() => reference.landing[country] ?? EMPTY);
  const own = Boolean(reference.landing[country]);
  const shared = faqFor(reference.faq.filter((item) => item.published), country, reference.countries);
  // The hero's default lead, as the site picks it for the country.
  const leadKey = info.print ? (country === "KZ" ? "landing.hero.lead" : "landing.hero.lead.print") : "landing.hero.lead.pdf";

  const save = useMutation({
    mutationFn: () => saveLanding(country, CountryLandingSchema.parse(draft)),
    onSuccess: (landing) => saved({ landing: { ...reference.landing, [country]: landing } }),
  });
  const reset = useMutation({
    mutationFn: () => clearLanding(country),
    onSuccess: () => {
      const rest = { ...reference.landing };
      delete rest[country];
      saved({ landing: rest });
      setDraft(EMPTY);
      save.reset();
    },
  });
  const failure = save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN ? new Error(t("admin.scope.forbidden")) : save.error;

  const setHero = (language: Language, field: "title" | "lead", value: string) =>
    setDraft((d) => ({ ...d, hero: { ...d.hero, [language]: { ...d.hero[language], [field]: value || undefined } } }));
  const setFaq = (index: number, patch: Partial<CountryFaqItem>) =>
    setDraft((d) => ({ ...d, faq: d.faq.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const toggle = <T extends string>(list: readonly T[], value: T, on: boolean): T[] => (on ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <form
      data-testid="reference-landing"
      data-country={country}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <Card title={t("admin.reference.landing.hero")}>
        {languages.map((language) => (
          <fieldset key={language} className="flex flex-col gap-3 rounded-xl bg-background p-4">
            <legend className="contents font-bold">{LANGUAGE_NAMES[language]}</legend>
            <Field label={t("admin.reference.landing.title")}>
              <Input
                data-testid={`landing-hero-title-${language}`}
                maxLength={120}
                placeholder={MESSAGES[language]["landing.hero.title"]}
                value={draft.hero[language]?.title ?? ""}
                onChange={(e) => setHero(language, "title", e.target.value)}
              />
            </Field>
            <Field label={t("admin.reference.landing.lead")}>
              <Textarea
                data-testid={`landing-hero-lead-${language}`}
                className="min-h-16"
                maxLength={400}
                placeholder={MESSAGES[language][leadKey]}
                value={draft.hero[language]?.lead ?? ""}
                onChange={(e) => setHero(language, "lead", e.target.value)}
              />
            </Field>
          </fieldset>
        ))}
      </Card>

      <Card title={t("admin.reference.landing.sections")}>
        <div className="flex flex-wrap gap-4">
          {LANDING_SECTIONS.map((section) => {
            const shown = !draft.hiddenSections.includes(section);
            return (
              <ChoiceLabel key={section}>
                <Checkbox
                  data-testid={`landing-section-${section}`}
                  checked={shown}
                  onChange={() => setDraft((d) => ({ ...d, hiddenSections: toggle(d.hiddenSections, section, !shown) }))}
                />
                {t(`admin.reference.landing.section.${section}`)}
              </ChoiceLabel>
            );
          })}
        </div>
      </Card>

      <Card title={t("admin.reference.landing.faq")}>
        <p className="-mt-2 text-sm text-muted">{t("admin.reference.landing.faq.hint")}</p>
        <ul className="flex flex-col gap-2">
          {shared.map((item) => {
            const shown = !draft.faqHidden.includes(item.id);
            return (
              <li key={item.id}>
                <ChoiceLabel>
                  <Checkbox
                    data-testid={`landing-faq-${item.id}`}
                    checked={shown}
                    onChange={() => setDraft((d) => ({ ...d, faqHidden: toggle(d.faqHidden, item.id, !shown) }))}
                  />
                  {localized(item.q, locale)}
                </ChoiceLabel>
              </li>
            );
          })}
        </ul>
        <p className="text-sm font-semibold">{t("admin.reference.landing.faq.own")}</p>
        {draft.faq.map((item, index) => (
          <div key={item.id} data-testid="landing-faq-own" className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <ChoiceLabel>
                <Checkbox data-testid={`landing-faq-own-published-${index}`} checked={item.published} onChange={(e) => setFaq(index, { published: e.target.checked })} />
                {t("admin.published")}
              </ChoiceLabel>
              <IconButton
                variant="ghost"
                data-testid={`landing-faq-own-remove-${index}`}
                label={t("admin.reference.landing.faq.remove")}
                onClick={() => setDraft((d) => ({ ...d, faq: d.faq.filter((_, i) => i !== index) }))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            {languages.map((language) => (
              <div key={language} className="grid gap-2 md:grid-cols-[6rem_1fr_2fr]">
                <span className="text-sm font-medium">{LANGUAGE_NAMES[language]}</span>
                <Input
                  data-testid={`landing-faq-own-q-${index}-${language}`}
                  aria-label={`${t("admin.reference.landing.faq.q")} (${LANGUAGE_NAMES[language]})`}
                  placeholder={t("admin.reference.landing.faq.q")}
                  maxLength={200}
                  value={item.q[language] ?? ""}
                  onChange={(e) => setFaq(index, { q: { ...item.q, [language]: e.target.value || undefined } })}
                />
                <Textarea
                  data-testid={`landing-faq-own-a-${index}-${language}`}
                  aria-label={`${t("admin.reference.landing.faq.a")} (${LANGUAGE_NAMES[language]})`}
                  placeholder={t("admin.reference.landing.faq.a")}
                  className="min-h-12"
                  maxLength={1500}
                  value={item.a[language] ?? ""}
                  onChange={(e) => setFaq(index, { a: { ...item.a, [language]: e.target.value || undefined } })}
                />
              </div>
            ))}
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          data-testid="landing-faq-add"
          icon={<Plus className="size-4" />}
          onClick={() =>
            setDraft((d) => ({ ...d, faq: [...d.faq, { id: `${country.toLowerCase()}-${Date.now().toString(36)}`, q: {}, a: {}, published: true }] }))
          }
        >
          {t("admin.reference.landing.faq.add")}
        </Button>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SaveBar testId="landing-save" pending={save.isPending} saved={save.isSuccess} error={failure} problems={false} />
        {own && (
          <Button variant="ghost" data-testid="landing-reset" loading={reset.isPending} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.landing.reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
