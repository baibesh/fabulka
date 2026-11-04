"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/query";
import {
  CHILD_AGE_MAX,
  CHILD_AGE_MIN,
  CONSENT_OUTDATED,
  GENERATION_PAUSED,
  LIMIT_REACHED,
  PHOTO_REFUSALS,
  PHOTO_REFUSED,
  answersProblem,
  fitsAge,
  heroPhotoOffered,
  type ChildLook,
  type PhotoRefusal,
  type Template,
  type VoicePrefill,
} from "@fabulka/shared";
import { ArrowLeft, ArrowRight, BookOpen, CirclePause } from "lucide-react";
import { LocaleLink, useLocaleRouter } from "@/i18n/routing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type FieldErrors, type FieldPath } from "react-hook-form";
import { ApiError, createBook, getHeroConsent, getQuota, getStatus, uploadHeroPhoto, uploadToy } from "@/lib/api";
import { loginUrl, useMe } from "@/lib/auth";
import { photoProblem, readDataUrl, shrinkPhoto } from "@/lib/photo-file";
import { toJpegDataUrl } from "@/lib/toy-photo";
import { useMethodologies } from "@/lib/use-methodologies";
import { ages, FormSchema, STEP_FIELDS, STEPS, splitInterests, type FormValues, type Step } from "./book-form-model";
import { ReviewSummary } from "./book-form-review";
import { ChildStep, StoryStep, ToyStep } from "./book-form-steps";
import { LookStep } from "./book-form-look";
import { PriceTag } from "./price-tag";
import { useI18n } from "@/i18n/i18n";
import type { MessageKey } from "@/i18n/messages";
import { Paywall } from "./paywall";
import { VoiceStep } from "./voice-step";
import { ErrorText, Notice } from "../ui/notice";
import { Button } from "../ui/button";

/** Where the answers wait while the parent signs in for the photo path (this tab only). */
const DRAFT_KEY = "fabulka.wizardDraft";

/** The answers saved before sign-in for this form, once (they are removed as they are read). */
function takeDraft(path: string): FormValues | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_KEY);
    const draft = JSON.parse(raw) as { path?: string; values?: unknown };
    if (draft.path !== path) return null;
    const parsed = FormSchema.safeParse(draft.values);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The look the parent picked, without the fields left to the illustrator; undefined when none. */
function pickedLook(look: ChildLook): ChildLook | undefined {
  const picked = Object.fromEntries(Object.entries(look).filter(([, value]) => value !== undefined && value !== null));
  return Object.keys(picked).length ? (picked as ChildLook) : undefined;
}

/**
 * A book of your own, or, with `template`, a catalog book with its questions - filled in step by
 * step, each step checked before the next, and everything shown once more before the book starts.
 */
export function BookForm({ template }: { template?: Template }) {
  const router = useLocaleRouter();
  const { t, locale, info } = useI18n();
  const ageOptions = template ? ages(template.ageMin, template.ageMax) : ages(CHILD_AGE_MIN, CHILD_AGE_MAX);
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
      heroMode: "description",
      look: {},
    },
  });
  const age = Number(useWatch({ control: form.control, name: "age" }));
  // The book follows the page's language (another address, another language) until changed by hand.
  useEffect(() => {
    if (!form.getFieldState("language").isDirty) form.setValue("language", locale);
  }, [form, locale]);
  // The languages offered in the visitor's country, and the page's own if the country lacks it (the
  // address decides the language: an English page in Kazakhstan still offers an English book).
  const bookLanguages = useMemo(() => (info.languages.includes(locale) ? info.languages : [...info.languages, locale]), [info.languages, locale]);
  useEffect(() => {
    if (!bookLanguages.includes(form.getValues("language"))) form.setValue("language", bookLanguages[0]);
  }, [form, bookLanguages]);
  // Until the methods arrive only "pick by age" is offered, which needs none of them.
  const { data: allMethods } = useMethodologies();
  const methods = (allMethods ?? []).filter((m) => fitsAge(m, age));
  const queryClient = useQueryClient();
  const quota = useQuery({ queryKey: ["quota"], queryFn: getQuota });
  // Said up front, so a parent does not fill in the whole form only to be turned away.
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus });
  const paused = status.data?.paused === true;

  const steps = STEPS.filter((s) => s !== "voice" || status.data?.voice === true);
  // Whether the voice step is known yet: it comes once the form runs in the browser and the API
  // answered, so until then the form starts at the child step (E2E flows wait for "on" or "off").
  const voice = status.isPending ? "pending" : status.data?.voice ? "on" : "off";
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

  // ---- The hero's look: a description, or the child's photo (signed in, after the consent) ----
  const me = useMe();
  const signedIn = me.isPending ? null : Boolean(me.data?.user);
  const offered = heroPhotoOffered(info);
  const heroMode = useWatch({ control: form.control, name: "heroMode" });
  const consent = useQuery({
    queryKey: ["consent", "hero-photo", locale],
    queryFn: () => getHeroConsent(locale),
    enabled: heroMode === "photo" && signedIn === true,
  });
  // The consent version the parent accepted on this screen; a new version asks again.
  const [accepted, setAccepted] = useState<number | null>(null);
  const [heroPhoto, setHeroPhoto] = useState<File | null>(null);
  const heroPreview = useMemo(() => (heroPhoto ? URL.createObjectURL(heroPhoto) : null), [heroPhoto]);
  useEffect(() => () => void (heroPreview && URL.revokeObjectURL(heroPreview)), [heroPreview]);
  const [heroProblem, setHeroProblem] = useState<PhotoRefusal | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);
  const pickHeroPhoto = async (file: File | null) => {
    setLookError(null);
    if (!file) {
      setHeroPhoto(null);
      setHeroProblem(null);
      return;
    }
    const shrunk = await shrinkPhoto(file);
    const problem = photoProblem(shrunk);
    setHeroProblem(problem);
    setHeroPhoto(problem ? null : shrunk);
  };
  // Where sign-in comes back to; the answers so far wait in this tab meanwhile.
  const returnPath = template ? `/catalog/${template.slug}` : "/create";
  const signIn = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ path: returnPath, values: form.getValues() }));
    } catch {
      // Storage blocked: the parent fills the form in again.
    }
    window.location.href = loginUrl(returnPath, locale);
  };
  // Back from sign-in: the answers come back and the wizard opens on the look step.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = takeDraft(returnPath);
    if (!draft) return;
    form.reset(draft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time restore after the sign-in redirect
    setChosen("look");
  }, [form, returnPath]);
  // The photo path is only for countries that offer it.
  useEffect(() => {
    if (!offered && form.getValues("heroMode") === "photo") form.setValue("heroMode", "description");
  }, [form, offered]);
  /** The look step is done: a description (anything goes), or a photo with the current consent. */
  const lookReady = () => {
    if (form.getValues("heroMode") !== "photo") return true;
    const problem =
      signedIn !== true
        ? t("look.error.signin")
        : !consent.data || accepted !== consent.data.version
          ? t("look.error.consent")
          : !heroPhoto
            ? t("look.error.photo")
            : null;
    setLookError(problem);
    return !problem;
  };

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
  // The hero photo is sent only when the book starts (with the consent given for it), once per try.
  const lastHero = useRef<{ file: File; version: number; upload: string } | null>(null);
  const uploadedHero = async (file: File) => {
    const text = consent.data!;
    if (lastHero.current?.file !== file || lastHero.current.version !== text.version) {
      const upload = await uploadHeroPhoto(await readDataUrl(file), { version: text.version, language: text.language, accepted: true });
      lastHero.current = { file, version: text.version, upload };
    }
    return lastHero.current.upload;
  };

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const fromPhoto = values.heroMode === "photo" && heroPhoto && consent.data;
      const look = values.heroMode === "description" ? pickedLook(values.look) : undefined;
      return createBook({
        child: {
          name: values.name,
          age: Number(values.age),
          gender: values.gender,
          interests: splitInterests(values.interests),
          pet: values.pet || undefined,
          city: values.city,
          language: values.language,
          ...(look && { look }),
        },
        ...(fromPhoto && { heroPhoto: { upload: await uploadedHero(heroPhoto) } }),
        ...(toyPhoto && {
          toy: { upload: await uploadedToy(toyPhoto), name: values.toyName || undefined },
        }),
        ...(template
          ? { template: template.slug, answers: values.answers }
          : {
              methodology: methods.some((m) => m.slug === values.methodology) ? values.methodology : undefined,
              theme: values.theme || undefined,
            }),
      });
    },
    onSuccess: (book) => {
      // The book has taken the photos; a next book uploads them again.
      lastUpload.current = null;
      lastHero.current = null;
      void queryClient.invalidateQueries({ queryKey: ["quota"] });
      router.push(`/books/${book.id}`);
    },
    onError: (error) => {
      // Paused after the page loaded: show the notice instead of leaving a bare error.
      if (error instanceof ApiError && error.code === GENERATION_PAUSED) void queryClient.invalidateQueries({ queryKey: ["status"] });
      // The consent text changed while the parent was filling in the form: read it again.
      if (error instanceof ApiError && error.code === CONSENT_OUTDATED) {
        setAccepted(null);
        void consent.refetch();
        setLookError(t("look.error.outdated"));
        goTo("look");
      }
      if (error instanceof ApiError && error.code === PHOTO_REFUSED && heroPhoto) {
        const reason = (error.body as { reason?: string } | undefined)?.reason;
        setHeroProblem((PHOTO_REFUSALS as readonly string[]).includes(reason ?? "") ? (reason as PhotoRefusal) : "decode");
        setHeroPhoto(null);
        goTo("look");
      }
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
    if (step === "look" && !lookReady()) return;
    goTo(steps[index + 1]);
  };

  // Everything is checked again on submit; a field that fails sends the parent back to its step.
  const backToProblem = (problems: FieldErrors<FormValues>) => {
    const broken = steps.find((s) => STEP_FIELDS[s].some((name) => name in problems));
    if (broken) goTo(broken);
  };
  const submit = form.handleSubmit((values) => {
    if (!lookReady()) return goTo("look");
    if (!answersGiven()) return goTo("story");
    create.mutate(values);
  }, backToProblem);
  const limitReached = create.error instanceof ApiError && create.error.code === LIMIT_REACHED;

  const values = form.getValues();
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
        <LocaleLink href="/#examples" data-testid="paused-examples" className="self-start font-semibold text-accent">
          {t("form.paused.examples")} →
        </LocaleLink>
      </Notice>
    )}
    <form
      data-testid="book-form"
      data-voice={voice}
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

      {step === "child" && <ChildStep form={form} ageOptions={ageOptions} languages={bookLanguages} heard={heard} />}

      {step === "look" && (
        <LookStep
          form={form}
          error={lookError}
          path={{
            offered,
            signedIn,
            onSignIn: signIn,
            consent: consent.data,
            consentError: consent.isError,
            accepted,
            onAccept: (version) => {
              setAccepted(version);
              setLookError(null);
            },
            onRevoke: () => {
              setAccepted(null);
              setHeroPhoto(null);
            },
            photo: heroPhoto,
            preview: heroPreview,
            onPhoto: (file) => void pickHeroPhoto(file),
            problem: heroProblem,
          }}
        />
      )}

      {step === "story" && <StoryStep form={form} template={template} methods={methods} />}

      {step === "toy" && <ToyStep form={form} photo={toyPhoto} preview={toyPreview} onPhoto={setToyPhoto} />}

      {step === "review" && (
        <div data-testid="wizard-review" className="flex flex-col gap-4">
          <p className="text-muted">{t("wizard.review.lead")}</p>
          <ReviewSummary
            values={values}
            template={template}
            methodName={method?.name}
            hasPhoto={Boolean(toyPhoto)}
            heroPhoto={values.heroMode === "photo" && heroPhoto ? accepted : null}
            stepName={stepName}
            onEdit={goTo}
          />
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

