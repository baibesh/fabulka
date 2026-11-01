"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/query";
import {
  GENERATION_PAUSED,
  LANGUAGES,
  LIMIT_REACHED,
  answersProblem,
  fitsAge,
  type Template,
  type VoicePrefill,
} from "@fabulka/shared";
import { ArrowLeft, ArrowRight, BookOpen, CirclePause, Mic, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldErrors, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { ApiError, createBook, getQuota, getStatus, uploadToy } from "@/lib/api";
import { toJpegDataUrl } from "@/lib/toy-photo";
import { useMethodologies } from "@/lib/use-methodologies";
import { PriceTag } from "./price-tag";
import { useI18n } from "@/i18n/i18n";
import { LOCALE_NAMES, type MessageKey } from "@/i18n/messages";
import { Paywall } from "./paywall";
import { VoiceStep } from "./voice-step";
import { ErrorText, Notice } from "./ui/notice";
import { Button } from "./ui/button";

const FormSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age: z.string(),
  gender: z.enum(["boy", "girl"]),
  interests: z.string().trim().min(1),
  pet: z.string().trim().max(60),
  city: z.string().trim().min(1).max(60),
  language: z.enum(LANGUAGES),
  /** "" lets the API pick a method by age. */
  methodology: z.string(),
  theme: z.string().trim().max(200),
  toyName: z.string().trim().max(40),
  answers: z.record(z.string(), z.string()),
});
type FormValues = z.infer<typeof FormSchema>;

/** The wizard's steps in order; "voice" is offered only while voice input is on. */
const STEPS = ["voice", "child", "story", "toy", "review"] as const;
type Step = (typeof STEPS)[number];

/** Fields each step checks before moving on; answers to a template's questions are checked apart. */
const STEP_FIELDS: Record<Step, FieldPath<FormValues>[]> = {
  voice: [],
  child: ["name", "age", "gender", "language", "interests", "city"],
  story: ["theme", "methodology"],
  toy: ["pet", "toyName"],
  review: [],
};

const ages = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => String(i + min));

const field = "w-full rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent";
const label = "flex flex-col gap-1.5 text-sm font-semibold";

/**
 * A book of your own, or, with `template`, a catalog book with its questions — filled in step by
 * step, each step checked before the next, and everything shown once more before the book starts.
 */
export function BookForm({ template }: { template?: Template }) {
  const router = useRouter();
  const { t, locale, info } = useI18n();
  const ageOptions = template ? ages(template.ageMin, template.ageMax) : ages(2, 10);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      age: ageOptions.includes("5") ? "5" : ageOptions[0],
      gender: "girl",
      interests: "",
      pet: "",
      city: "Алматы",
      language: locale,
      methodology: "",
      theme: "",
      toyName: "",
      answers: {},
    },
  });
  const age = Number(useWatch({ control: form.control, name: "age" }));
  // The interface language is known only after hydration; the book follows it until changed by hand.
  useEffect(() => {
    if (!form.getFieldState("language").isDirty) form.setValue("language", locale);
  }, [form, locale]);
  // Only the languages offered in the visitor's country; a choice the new country lacks is dropped.
  const bookLanguages = info.languages;
  useEffect(() => {
    if (!bookLanguages.includes(form.getValues("language"))) form.setValue("language", bookLanguages[0]);
  }, [form, bookLanguages]);
  // Until the methods arrive only "pick by age" is offered, which needs none of them.
  const { data: allMethods } = useMethodologies();
  const methods = (allMethods ?? []).filter((m) => fitsAge(m, age));
  const errors = form.formState.errors;
  const queryClient = useQueryClient();
  const quota = useQuery({ queryKey: ["quota"], queryFn: getQuota });
  // Said up front, so a parent does not fill in the whole form only to be turned away.
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus });
  const paused = status.data?.paused === true;

  const steps = STEPS.filter((s) => s !== "voice" || status.data?.voice === true);
  const [chosen, setChosen] = useState<Step | null>(null);
  const step = chosen && steps.includes(chosen) ? chosen : steps[0];
  const index = steps.indexOf(step);
  const stepName = (s: Step): MessageKey =>
    s === "story" ? (template ? "wizard.steps.questions" : "wizard.steps.story") : `wizard.steps.${s}`;
  const goTo = setChosen;
  // A step the parent moved to is announced by moving focus to its heading (not on page load).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (chosen) heading.current?.focus();
  }, [chosen]);

  const [toyPhoto, setToyPhoto] = useState<File | null>(null);
  const toyPreview = useMemo(() => (toyPhoto ? URL.createObjectURL(toyPhoto) : null), [toyPhoto]);
  useEffect(() => () => void (toyPreview && URL.revokeObjectURL(toyPreview)), [toyPreview]);

  // What the parent's recording said, shown over the fields it filled in.
  const [heard, setHeard] = useState<string | null>(null);
  const applyPrefill = ({ transcript, child, toyName, theme, answers }: VoicePrefill) => {
    const set = (name: FieldPath<FormValues>, value: string) => form.setValue(name, value, { shouldDirty: true });
    if (child.name) set("name", child.name);
    if (child.age !== undefined && ageOptions.includes(String(child.age))) set("age", String(child.age));
    if (child.gender) set("gender", child.gender);
    if (child.interests?.length) set("interests", child.interests.join(", "));
    if (child.pet) set("pet", child.pet);
    if (child.city) set("city", child.city);
    if (toyName) set("toyName", toyName);
    if (theme && !template) set("theme", theme);
    for (const [key, answer] of Object.entries(answers ?? {})) {
      if (template?.questions.some((q) => q.key === key)) set(`answers.${key}`, answer);
    }
    setHeard(transcript);
    goTo("child");
  };

  // A retry after the paywall or a validation error reuses the photo already uploaded.
  const lastUpload = useRef<{ file: File; upload: string } | null>(null);
  const uploadedToy = async (file: File) => {
    if (lastUpload.current?.file !== file) {
      lastUpload.current = { file, upload: await uploadToy(await toJpegDataUrl(file)) };
    }
    return lastUpload.current.upload;
  };

  const create = useMutation({
    mutationFn: async (values: FormValues) =>
      createBook({
        child: {
          name: values.name,
          age: Number(values.age),
          gender: values.gender,
          interests: splitInterests(values.interests),
          pet: values.pet || undefined,
          city: values.city,
          language: values.language,
        },
        ...(toyPhoto && {
          toy: { upload: await uploadedToy(toyPhoto), name: values.toyName || undefined },
        }),
        ...(template
          ? { template: template.slug, answers: values.answers }
          : {
              methodology: methods.some((m) => m.slug === values.methodology) ? values.methodology : undefined,
              theme: values.theme || undefined,
            }),
      }),
    onSuccess: (book) => {
      // The book has taken the photo; a next book uploads it again.
      lastUpload.current = null;
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
      router.push(`/books/${book.id}`);
    },
    onError: (error) => {
      // Paused after the page loaded: show the notice instead of leaving a bare error.
      if (error instanceof ApiError && error.code === GENERATION_PAUSED) void queryClient.invalidateQueries({ queryKey: ["status"] });
    },
  });

  /** The first required answer left empty, said on the questions step; true when all are given. */
  const answersGiven = () => {
    const problem = template && answersProblem(template.questions, form.getValues("answers"));
    if (problem) {
      // The form offers only valid options, so the one problem a parent can hit is a missing answer.
      form.setError("root.answers", { message: t("form.answers.required", { label: problem.question.label }) });
      return false;
    }
    form.clearErrors("root.answers");
    return true;
  };

  const next = async () => {
    const fields = STEP_FIELDS[step];
    if (fields.length && !(await form.trigger(fields, { shouldFocus: true }))) return;
    if (step === "story" && !answersGiven()) return;
    goTo(steps[index + 1]);
  };

  // Everything is checked again on submit; a field that fails sends the parent back to its step.
  const backToProblem = (problems: FieldErrors<FormValues>) => {
    const broken = steps.find((s) => STEP_FIELDS[s].some((name) => name in problems));
    if (broken) goTo(broken);
  };
  const submit = form.handleSubmit((values) => {
    if (!answersGiven()) return goTo("story");
    create.mutate(values);
  }, backToProblem);
  const limitReached = create.error instanceof ApiError && create.error.code === LIMIT_REACHED;

  const values = form.getValues();
  const interests = splitInterests(values.interests).join(", ");
  const method = methods.find((m) => m.slug === values.methodology);

  return (
    <div className="flex flex-col gap-4">
    {paused && (
      <Notice
        as="section"
        data-testid="paused-notice"
        role="status"
        tone="accent"
        size="lg"
        icon={<CirclePause className="size-8 shrink-0 text-accent" />}
        title={t("form.paused.title")}
      >
        <p className="text-muted">{t("form.paused.text")}</p>
        <Link href="/#examples" data-testid="paused-examples" className="self-start font-semibold text-accent">
          {t("form.paused.examples")} →
        </Link>
      </Notice>
    )}
    <form
      data-testid="book-form"
      // Enter in a field moves to the next step; only the last step creates the book.
      onSubmit={(e) => {
        if (step === "review") return void submit(e);
        e.preventDefault();
        void next();
      }}
      className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div data-testid="wizard-step" data-step={step} className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-muted">{t("wizard.step", { n: index + 1, total: steps.length })}</p>
        <ol className="flex gap-1.5">
          {steps.map((s, i) => (
            <li key={s} aria-current={s === step ? "step" : undefined} className="flex flex-1 flex-col gap-1.5">
              <span className={`h-1.5 rounded-full ${i <= index ? "bg-accent" : "bg-border"}`} />
              <span className={`hidden text-xs sm:block ${s === step ? "font-bold" : "text-muted"}`}>{t(stepName(s))}</span>
            </li>
          ))}
        </ol>
        <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 text-2xl font-extrabold outline-none">
          {step === "voice" ? t("voice.title") : t(stepName(step))}
        </h2>
      </div>

      {step === "voice" && <VoiceStep template={template} onPrefill={applyPrefill} onSkip={() => goTo("child")} />}

      {step === "child" && (
        <div className="grid gap-5 sm:grid-cols-2">
          {heard && (
            <Notice data-testid="voice-transcript" role="status" tone="subtle" icon={<Mic className="size-5 shrink-0 text-accent" />} className="sm:col-span-2">
              <p>{t("voice.heard", { transcript: heard })}</p>
              <p className="font-semibold">{t("voice.check")}</p>
            </Notice>
          )}
          <label className={label}>
            {t("form.name")}
            <input data-testid="child-name" className={field} placeholder={t("form.name.placeholder")} {...form.register("name")} />
            {errors.name && <span className="text-danger">{t("form.name.error")}</span>}
          </label>

          <label className={label}>
            {t("form.age")}
            <select data-testid="child-age" className={field} {...form.register("age")}>
              {ageOptions.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </label>

          <fieldset className={label}>
            <legend className="mb-1.5">{t("form.hero")}</legend>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 font-normal">
                <input type="radio" value="girl" {...form.register("gender")} /> {t("form.girl")}
              </label>
              <label className="flex items-center gap-2 font-normal">
                <input type="radio" value="boy" {...form.register("gender")} /> {t("form.boy")}
              </label>
            </div>
          </fieldset>

          <label className={label}>
            {t("form.bookLanguage")}
            <select data-testid="book-language" className={field} {...form.register("language")}>
              {bookLanguages.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>

          <label className={`${label} sm:col-span-2`}>
            {t("form.interests")}
            <input data-testid="child-interests" className={field} placeholder={t("form.interests.placeholder")} {...form.register("interests")} />
            {errors.interests && <span className="text-danger">{t("form.interests.error")}</span>}
          </label>

          <label className={label}>
            {t("form.city")}
            <input data-testid="child-city" className={field} {...form.register("city")} />
            {errors.city && <span className="text-danger">{t("form.city.error")}</span>}
          </label>
        </div>
      )}

      {step === "story" &&
        (template ? (
          <fieldset data-testid="template-questions" className="grid gap-5 sm:grid-cols-2">
            <legend className="sr-only">{t("form.questions")}</legend>
            {template.questions.map((q) => (
              <label key={q.key} className={label}>
                {q.label}
                {!q.required && <span className="font-normal text-muted">{t("common.optional")}</span>}
                {q.kind === "choice" ? (
                  <select data-testid={`answer-${q.key}`} className={field} {...form.register(`answers.${q.key}`)}>
                    <option value="">—</option>
                    {q.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    data-testid={`answer-${q.key}`}
                    className={field}
                    placeholder={q.placeholder}
                    {...form.register(`answers.${q.key}`)}
                  />
                )}
              </label>
            ))}
            {errors.root?.answers && <ErrorText className="sm:col-span-2">{errors.root.answers.message}</ErrorText>}
          </fieldset>
        ) : (
          <div className="grid gap-5">
            <label className={label}>
              {t("form.theme")}
              <input
                data-testid="book-theme"
                className={field}
                placeholder={t("form.theme.placeholder")}
                {...form.register("theme")}
              />
            </label>
            <label className={label}>
              {t("form.method")}
              <select data-testid="book-methodology" className={field} {...form.register("methodology")}>
                <option value="">{t("form.method.auto")}</option>
                {methods.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name} — {m.summary}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}

      {step === "toy" && (
        <div className="grid gap-5">
          <fieldset className="grid gap-4 rounded-2xl border border-dashed border-border p-4 sm:grid-cols-[8rem_1fr]">
            <legend className="px-1 text-sm font-semibold">{t("form.toy.legend")}</legend>
            <label className="relative flex aspect-square w-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-center text-xs text-muted hover:border-accent sm:w-auto">
              {toyPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
                <img src={toyPreview} alt={t("form.toy.alt")} className="h-full w-full object-cover" />
              ) : (
                <span className="p-2">{t("form.toy.pick")}</span>
              )}
              <input
                data-testid="toy-photo"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setToyPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {t("form.toy.text")}
              </p>
              <input data-testid="toy-name" className={field} placeholder={t("form.toy.name")} {...form.register("toyName")} />
              {toyPhoto && (
                <Button variant="ghost" size="inline" icon={<X className="size-4" />} onClick={() => setToyPhoto(null)} className="self-start text-sm">
                  {t("form.toy.remove")}
                </Button>
              )}
            </div>
          </fieldset>

          <label className={label}>
            {t("form.pet")}
            <input data-testid="child-pet" className={field} placeholder={t("form.pet.placeholder")} {...form.register("pet")} />
          </label>
        </div>
      )}

      {step === "review" && (
        <div data-testid="wizard-review" className="flex flex-col gap-4">
          <p className="text-muted">{t("wizard.review.lead")}</p>
          <ReviewGroup title={t(stepName("child"))} edit={t("wizard.edit")} step="child" onEdit={goTo}>
            <ReviewRow name={t("form.name")} value={values.name} />
            <ReviewRow name={t("form.age")} value={values.age} />
            <ReviewRow name={t("form.hero")} value={t(values.gender === "boy" ? "form.boy" : "form.girl")} />
            <ReviewRow name={t("form.bookLanguage")} value={LOCALE_NAMES[values.language]} />
            <ReviewRow name={t("wizard.review.interests")} value={interests} />
            <ReviewRow name={t("form.city")} value={values.city} />
          </ReviewGroup>
          <ReviewGroup title={t(stepName("story"))} edit={t("wizard.edit")} step="story" onEdit={goTo}>
            {template ? (
              template.questions.map((q) => (
                <ReviewRow key={q.key} name={q.label} value={values.answers[q.key] || t("wizard.review.none")} />
              ))
            ) : (
              <>
                <ReviewRow name={t("wizard.review.theme")} value={values.theme || t("wizard.review.none")} />
                <ReviewRow
                  name={t("form.method")}
                  value={method ? method.name : t("form.method.auto")}
                />
              </>
            )}
          </ReviewGroup>
          <ReviewGroup title={t(stepName("toy"))} edit={t("wizard.edit")} step="toy" onEdit={goTo}>
            <ReviewRow
              name={t("wizard.review.toy")}
              value={
                [values.toyName, toyPhoto && t("wizard.review.photo")].filter(Boolean).join(", ") || t("wizard.review.none")
              }
            />
            <ReviewRow name={t("wizard.review.pet")} value={values.pet || t("wizard.review.none")} />
          </ReviewGroup>
          <PriceTag kind={template ? "template" : "custom"} label={t("wizard.review.price")} testId="review-price" />
          <Button type="submit" size="lg" data-testid="create-book" loading={create.isPending} disabled={paused} icon={<BookOpen className="size-5" />}>
            {t("form.submit")}
          </Button>
          {quota.data && (
            <p data-testid="quota" className="text-center text-sm text-muted">
              {quota.data.demo
                ? t("form.quota.demo")
                : t("form.quota.left", { remaining: quota.data.remaining, limit: quota.data.limit })}
            </p>
          )}
          {create.isError && !limitReached && !paused && <ErrorText>{t("form.error", { message: create.error.message })}</ErrorText>}
        </div>
      )}

      {step !== "voice" && (
        <div className="flex items-center justify-between gap-3">
          {index > 0 ? (
            <Button variant="ghost" data-testid="wizard-back" icon={<ArrowLeft className="size-4" />} onClick={() => goTo(steps[index - 1])}>
              {t("wizard.back")}
            </Button>
          ) : (
            <span />
          )}
          {step !== "review" && (
            <Button type="submit" data-testid="wizard-next" iconEnd={<ArrowRight className="size-4" />}>
              {t("wizard.next")}
            </Button>
          )}
        </div>
      )}
    </form>
    {limitReached && <Paywall kind={template ? "template" : "custom"} onUnlocked={() => void submit()} />}
    </div>
  );
}

function splitInterests(interests: string) {
  return interests.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
}

/** One step's answers on the review, with a way back to change them. */
function ReviewGroup({
  title,
  edit,
  step,
  onEdit,
  children,
}: {
  title: string;
  edit: string;
  step: Step;
  onEdit: (step: Step) => void;
  children: ReactNode;
}) {
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
