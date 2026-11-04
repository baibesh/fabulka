"use client";

import type { Template } from "@fabulka/shared";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/i18n";
import { LOCALE_NAMES, type MessageKey } from "@/i18n/messages";
import { splitInterests, type FormValues, type Step } from "./book-form-model";
import { useLookSummary } from "./book-form-look";
import { Button } from "../ui/button";

/** Everything the parent filled in, step by step, each with a way back to change it. */
export function ReviewSummary({
  values,
  template,
  methodName,
  hasPhoto,
  heroPhoto,
  stepName,
  onEdit,
}: {
  values: FormValues;
  template?: Template;
  methodName?: string;
  hasPhoto: boolean;
  /** The consent version accepted when the hero is drawn from a photo; null for a description. */
  heroPhoto: number | null;
  stepName: (step: Step) => MessageKey;
  onEdit: (step: Step) => void;
}) {
  const { t } = useI18n();
  const lookSummary = useLookSummary();
  const none = t("wizard.review.none");
  const group = (step: Step, rows: ReactNode) => (
    <ReviewGroup title={t(stepName(step))} edit={t("wizard.edit")} step={step} onEdit={onEdit}>
      {rows}
    </ReviewGroup>
  );
  return (
    <>
      {group(
        "child",
        <>
          <ReviewRow name={t("form.name")} value={values.name} />
          <ReviewRow name={t("form.age")} value={values.age} />
          <ReviewRow name={t("form.hero")} value={t(values.gender === "boy" ? "form.boy" : "form.girl")} />
          <ReviewRow name={t("form.bookLanguage")} value={LOCALE_NAMES[values.language]} />
          <ReviewRow name={t("wizard.review.interests")} value={splitInterests(values.interests).join(", ")} />
          <ReviewRow name={t("form.city")} value={values.city} />
        </>,
      )}
      {group(
        "look",
        <ReviewRow
          name={t("look.review.hero")}
          value={heroPhoto !== null ? t("look.review.photo", { version: heroPhoto }) : lookSummary(values.look) || t("look.review.auto")}
        />,
      )}
      {group(
        "story",
        template ? (
          template.questions.map((q) => <ReviewRow key={q.key} name={q.label} value={values.answers[q.key] || none} />)
        ) : (
          <>
            <ReviewRow name={t("wizard.review.theme")} value={values.theme || none} />
            <ReviewRow name={t("form.method")} value={methodName ?? t("form.method.auto")} />
          </>
        ),
      )}
      {group(
        "toy",
        <>
          <ReviewRow name={t("wizard.review.toy")} value={[values.toyName, hasPhoto && t("wizard.review.photo")].filter(Boolean).join(", ") || none} />
          <ReviewRow name={t("wizard.review.pet")} value={values.pet || none} />
        </>,
      )}
    </>
  );
}

/** One step's answers on the review, with a way back to change them. */
function ReviewGroup({ title, edit, step, onEdit, children }: { title: string; edit: string; step: Step; onEdit: (step: Step) => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <Button variant="link" size="inline" data-testid={`wizard-edit-${step}`} icon={<Pencil className="size-3.5" />} onClick={() => onEdit(step)} className="text-sm">
          {edit}
        </Button>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">{children}</dl>
    </section>
  );
}

function ReviewRow({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{name}</dt>
      <dd className="mb-1 break-words font-semibold sm:mb-0">{value}</dd>
    </>
  );
}
