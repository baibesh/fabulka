"use client";

import type { Language, Template } from "@fabulka/shared";
import { Mic, X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useI18n } from "@/i18n/i18n";
import { LOCALE_NAMES } from "@/i18n/messages";
import type { useMethodologies } from "@/lib/use-methodologies";
import type { FormValues } from "./book-form-model";
import { Button } from "../ui/button";
import { ChoiceLabel, Radio } from "../ui/choice";
import { Field } from "../ui/field";
import { Input, Select } from "../ui/input";
import { ErrorText, Notice } from "../ui/notice";

type Form = UseFormReturn<FormValues>;
type Methods = NonNullable<ReturnType<typeof useMethodologies>["data"]>;

/** About the child: name, age, hero, the book's language, interests and city. */
export function ChildStep({ form, ageOptions, languages, heard }: { form: Form; ageOptions: string[]; languages: readonly Language[]; heard: string | null }) {
  const { t } = useI18n();
  const errors = form.formState.errors;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {heard && (
        <Notice data-testid="voice-transcript" role="status" tone="subtle" icon={<Mic className="size-5 shrink-0 text-accent" />} className="sm:col-span-2">
          <p>{t("voice.heard", { transcript: heard })}</p>
          <p className="font-semibold">{t("voice.check")}</p>
        </Notice>
      )}
      <Field label={t("form.name")} error={errors.name && t("form.name.error")}>
        <Input data-testid="child-name" placeholder={t("form.name.placeholder")} {...form.register("name")} />
      </Field>

      <Field label={t("form.age")}>
        <Select data-testid="child-age" {...form.register("age")}>
          {ageOptions.map((age) => (
            <option key={age} value={age}>
              {age}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-1.5 text-sm font-semibold">
        <legend className="mb-1.5">{t("form.hero")}</legend>
        <div className="flex min-h-control items-center gap-4">
          <ChoiceLabel>
            <Radio value="girl" {...form.register("gender")} /> {t("form.girl")}
          </ChoiceLabel>
          <ChoiceLabel>
            <Radio value="boy" {...form.register("gender")} /> {t("form.boy")}
          </ChoiceLabel>
        </div>
      </fieldset>

      <Field label={t("form.bookLanguage")}>
        <Select data-testid="book-language" {...form.register("language")}>
          {languages.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t("form.interests")} error={errors.interests && t("form.interests.error")} className="sm:col-span-2">
        <Input data-testid="child-interests" placeholder={t("form.interests.placeholder")} {...form.register("interests")} />
      </Field>

      <Field label={t("form.city")} error={errors.city && t("form.city.error")}>
        <Input data-testid="child-city" {...form.register("city")} />
      </Field>
    </div>
  );
}

/** A catalog book's questions, or for a story of your own its theme and method. */
export function StoryStep({ form, template, methods }: { form: Form; template?: Template; methods: Methods }) {
  const { t } = useI18n();
  const errors = form.formState.errors;
  if (template) {
    return (
      <fieldset data-testid="template-questions" className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">{t("form.questions")}</legend>
        {template.questions.map((q) => (
          <Field key={q.key} label={q.label} optional={!q.required && t("common.optional")}>
            {q.kind === "choice" ? (
              <Select data-testid={`answer-${q.key}`} {...form.register(`answers.${q.key}`)}>
                <option value="">-</option>
                {q.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input data-testid={`answer-${q.key}`} placeholder={q.placeholder} {...form.register(`answers.${q.key}`)} />
            )}
          </Field>
        ))}
        {errors.root?.answers && <ErrorText className="sm:col-span-2">{errors.root.answers.message}</ErrorText>}
      </fieldset>
    );
  }
  return (
    <div className="grid gap-5">
      <Field label={t("form.theme")}>
        <Input data-testid="book-theme" placeholder={t("form.theme.placeholder")} {...form.register("theme")} />
      </Field>
      <Field label={t("form.method")}>
        <Select data-testid="book-methodology" {...form.register("methodology")}>
          <option value="">{t("form.method.auto")}</option>
          {methods.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name} - {m.summary}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

/** The child's toy (a photo and its name) and a pet, both optional. */
export function ToyStep({
  form,
  photo,
  preview,
  onPhoto,
}: {
  form: Form;
  photo: File | null;
  preview: string | null;
  onPhoto: (file: File | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-4 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[8rem_1fr]">
        <legend className="px-1 text-sm font-semibold">{t("form.toy.legend")}</legend>
        <label className="relative flex aspect-square w-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-center text-xs text-muted hover:border-accent sm:w-auto">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
            <img src={preview} alt={t("form.toy.alt")} className="h-full w-full object-cover" />
          ) : (
            <span className="p-2">{t("form.toy.pick")}</span>
          )}
          <input data-testid="toy-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t("form.toy.text")}</p>
          <Input data-testid="toy-name" aria-label={t("form.toy.name")} placeholder={t("form.toy.name")} {...form.register("toyName")} />
          {photo && (
            <Button variant="ghost" size="inline" icon={<X className="size-4" />} onClick={() => onPhoto(null)} className="self-start text-sm">
              {t("form.toy.remove")}
            </Button>
          )}
        </div>
      </fieldset>

      <Field label={t("form.pet")}>
        <Input data-testid="child-pet" placeholder={t("form.pet.placeholder")} {...form.register("pet")} />
      </Field>
    </div>
  );
}
