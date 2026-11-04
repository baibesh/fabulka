"use client";

import {
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_LENGTHS,
  HAIR_TEXTURES,
  SKIN_TONES,
  type ChildLook,
  type ConsentText,
  type PhotoRefusal,
} from "@fabulka/shared";
import { Camera, Check, ExternalLink, ImagePlus, Lock, LogIn, Palette, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { useI18n } from "@/i18n/i18n";
import { PHOTO_ACCEPT } from "@/lib/photo-file";
import type { FormValues } from "./book-form-model";
import { Button, buttonClass } from "../ui/button";
import { Checkbox, ChoiceCard, Radio } from "../ui/choice";
import { cx } from "../ui/cx";
import { ErrorText, Notice } from "../ui/notice";
import { Spinner } from "../ui/spinner";

type Form = UseFormReturn<FormValues>;

/** What the photo path needs from the wizard: who is signed in, the consent, the photo picked. */
export interface PhotoPath {
  /** The country offers the photo path (its switch in the admin). */
  offered: boolean;
  /** null while the session is being read. */
  signedIn: boolean | null;
  onSignIn: () => void;
  consent: ConsentText | undefined;
  consentError: boolean;
  /** The version the parent accepted on this screen, or null. */
  accepted: number | null;
  onAccept: (version: number) => void;
  onRevoke: () => void;
  photo: File | null;
  preview: string | null;
  onPhoto: (file: File | null) => void;
  problem: PhotoRefusal | null;
}

/**
 * The hero's look, before anything is drawn: from the child's photo (signed in, after the consent
 * screen) or from a description, picked with buttons or left to the illustrator.
 */
export function LookStep({ form, path, error }: { form: Form; path: PhotoPath; error: string | null }) {
  const { t } = useI18n();
  const mode = useWatch({ control: form.control, name: "heroMode" });
  return (
    <div data-testid="look-step" data-mode={mode} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-muted">{t("look.lead")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            data-testid="hero-mode-photo"
            control={<Radio value="photo" disabled={!path.offered} {...form.register("heroMode")} />}
            className={cx("items-start", !path.offered && "cursor-not-allowed opacity-60")}
          >
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-bold">
                <Camera className="size-5 text-accent" aria-hidden />
                {t("look.mode.photo")}
              </span>
              <span className="text-sm text-muted">{t("look.mode.photo.text")}</span>
            </span>
          </ChoiceCard>
          <ChoiceCard
            data-testid="hero-mode-description"
            control={<Radio value="description" {...form.register("heroMode")} />}
            className="items-start"
          >
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-bold">
                <Palette className="size-5 text-accent" aria-hidden />
                {t("look.mode.description")}
              </span>
              <span className="text-sm text-muted">{t("look.mode.description.text")}</span>
            </span>
          </ChoiceCard>
        </div>
        {!path.offered && (
          <p data-testid="hero-photo-off" className="text-sm text-muted">
            {t("look.photo.off")}
          </p>
        )}
      </fieldset>

      {mode === "description" && <LookPicker form={form} />}
      {mode === "photo" && <PhotoSide path={path} />}
      {error && <ErrorText data-testid="look-error">{error}</ErrorText>}
    </div>
  );
}

function PhotoSide({ path }: { path: PhotoPath }) {
  const { t } = useI18n();
  if (path.signedIn === null) return <Spinner label={t("common.loading")} />;
  if (!path.signedIn)
    return (
      <Notice data-testid="hero-photo-signin" tone="highlight" icon={<LogIn className="size-5 shrink-0 text-accent" />} title={t("look.photo.signin.title")}>
        <p className="text-muted">{t("look.photo.signin.text")}</p>
        <Button data-testid="hero-photo-signin-button" size="sm" icon={<LogIn className="size-4" />} onClick={path.onSignIn} className="self-start">
          {t("look.photo.signin.button")}
        </Button>
      </Notice>
    );
  if (path.consentError) return <ErrorText>{t("photoConsent.error")}</ErrorText>;
  if (!path.consent) return <Spinner label={t("common.loading")} />;
  if (path.accepted !== path.consent.version) return <ConsentPanel key={path.consent.version} consent={path.consent} onAccept={path.onAccept} />;
  return <PhotoPicker path={path} />;
}

/**
 * The consent screen: the lead line first and large, then every clause in order; each checkbox
 * clause must be ticked before the photo can be chosen.
 */
function ConsentPanel({ consent, onAccept }: { consent: ConsentText; onAccept: (version: number) => void }) {
  const { t } = useI18n();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const boxes = consent.clauses.filter((c) => c.kind === "checkbox");
  const all = boxes.every((c) => ticked.has(c.id));
  const toggle = (id: string, on: boolean) =>
    setTicked((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <section
      data-testid="consent-panel"
      data-version={consent.version}
      data-language={consent.language}
      aria-labelledby="consent-title"
      className="flex flex-col gap-4 rounded-2xl border-2 border-accent bg-card p-4 sm:p-5"
    >
      <h3 id="consent-title" className="flex items-center gap-2 text-lg font-extrabold">
        <ShieldCheck className="size-6 shrink-0 text-accent" aria-hidden />
        {t("photoConsent.title")}
      </h3>
      {consent.clauses.map((clause, i) => {
        const link = clause.link && (
          <a href={clause.link.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 font-semibold text-accent underline">
            {clause.link.label}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        );
        if (clause.kind === "checkbox")
          return (
            <label
              key={clause.id}
              data-testid={`consent-check-${clause.id}`}
              data-checked={ticked.has(clause.id)}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/10",
                i === 0 ? "text-lg font-bold" : "text-base font-semibold",
              )}
            >
              <Checkbox
                data-testid="consent-checkbox"
                aria-required="true"
                checked={ticked.has(clause.id)}
                onChange={(e) => toggle(clause.id, e.target.checked)}
                className="mt-0.5 size-6"
              />
              <span>
                {clause.text}
                {link}
              </span>
            </label>
          );
        return (
          <p
            key={clause.id}
            data-testid={i === 0 ? "consent-lead" : "consent-clause"}
            className={i === 0 ? "rounded-xl bg-accent/10 p-3 text-lg leading-snug font-bold" : "text-sm text-muted"}
          >
            {clause.text}
            {link}
          </p>
        );
      })}
      <Button data-testid="consent-accept" disabled={!all} icon={<Check className="size-4" />} onClick={() => onAccept(consent.version)} className="self-start">
        {t("photoConsent.accept")}
      </Button>
      <p className="text-xs text-muted">{t("photoConsent.version", { version: consent.version })}</p>
    </section>
  );
}

/** After the consent: the photo, with a preview, what happens to it, and a way to take it back. */
function PhotoPicker({ path }: { path: PhotoPath }) {
  const { t } = useI18n();
  return (
    <section data-testid="hero-photo-step" data-has-photo={path.photo ? "true" : "false"} className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
      <p data-testid="consent-given" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-success">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {t("photoConsent.given", { version: path.accepted ?? 0 })}
        <Button variant="link" size="inline" data-testid="consent-revoke" onClick={path.onRevoke} className="text-sm">
          {t("photoConsent.revoke")}
        </Button>
      </p>
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <label className="relative flex aspect-square w-36 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-center text-sm text-muted hover:border-accent">
          {path.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file, never uploaded before the book starts
            <img data-testid="hero-photo-preview" src={path.preview} alt={t("look.photo.alt")} className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 p-2">
              <ImagePlus className="size-6" aria-hidden />
              {t("look.photo.pick")}
            </span>
          )}
          <input
            data-testid="hero-photo-input"
            type="file"
            accept={PHOTO_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              path.onPhoto(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <div className="flex flex-col gap-2 text-sm">
          <p>{t("look.photo.hint")}</p>
          <p data-testid="hero-photo-privacy" className="flex gap-2 text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("look.photo.privacy")}
          </p>
          {path.photo && (
            <Button variant="ghost" size="inline" data-testid="hero-photo-remove" icon={<X className="size-4" />} onClick={() => path.onPhoto(null)} className="self-start text-sm">
              {t("look.photo.remove")}
            </Button>
          )}
        </div>
      </div>
      {path.problem && (
        <ErrorText data-testid="hero-photo-error" data-reason={path.problem}>
          {t(`design.photo.error.${path.problem}`)}
        </ErrorText>
      )}
    </section>
  );
}

type LookField = keyof ChildLook;

/** The look with buttons: each choice toggles; nothing chosen leaves it to the illustrator. */
function LookPicker({ form }: { form: Form }) {
  const { t } = useI18n();
  const look = useWatch({ control: form.control, name: "look" }) ?? {};
  const set = (field: LookField, value: ChildLook[LookField] | undefined) =>
    form.setValue("look", { ...form.getValues("look"), [field]: value }, { shouldDirty: true });
  const pick = (field: LookField, value: string | boolean) => set(field, look[field] === value ? undefined : (value as never));
  const swatch = (field: LookField, id: string, hex: string, label: string, i: number) => (
    <button
      key={id}
      type="button"
      data-testid={`look-${field}-${id}`}
      aria-pressed={look[field] === id}
      aria-label={label}
      title={label}
      onClick={() => pick(field, id)}
      className="group flex flex-col items-center gap-1 rounded-xl p-1 text-xs focus-visible:outline-2 focus-visible:outline-accent"
      data-index={i}
    >
      <span
        className="size-10 rounded-full border-2 border-border shadow-sm group-aria-pressed:border-accent group-aria-pressed:ring-2 group-aria-pressed:ring-accent group-aria-pressed:ring-offset-2"
        style={{ backgroundColor: hex }}
      />
    </button>
  );
  const chip = (field: LookField, id: string | boolean, label: string, testId: string) => (
    <button key={String(id)} type="button" data-testid={testId} aria-pressed={look[field] === id} onClick={() => pick(field, id)} className={buttonClass({ variant: "secondary", size: "sm" })}>
      {label}
    </button>
  );
  return (
    <div data-testid="look-picker" className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("look.picker.hint")}</p>
      <LookRow label={t("look.skin")}>
        {SKIN_TONES.map((s, i) => swatch("skin", s.id, s.hex, t("look.skin.n", { n: i + 1, total: SKIN_TONES.length }), i))}
      </LookRow>
      <LookRow label={t("look.hairColor")}>
        {HAIR_COLORS.map((h, i) => (
          <span key={h.id} className="flex flex-col items-center">
            {swatch("hairColor", h.id, h.hex, t(`look.hair.${h.id}`), i)}
            <span className="text-xs text-muted">{t(`look.hair.${h.id}`)}</span>
          </span>
        ))}
      </LookRow>
      <LookRow label={t("look.hairLength")}>{HAIR_LENGTHS.map((id) => chip("hairLength", id, t(`look.length.${id}`), `look-hairLength-${id}`))}</LookRow>
      <LookRow label={t("look.hairTexture")}>{HAIR_TEXTURES.map((id) => chip("hairTexture", id, t(`look.texture.${id}`), `look-hairTexture-${id}`))}</LookRow>
      <LookRow label={t("look.eyes")}>
        {EYE_COLORS.map((e, i) => (
          <span key={e.id} className="flex flex-col items-center">
            {swatch("eyes", e.id, e.hex, t(`look.eyes.${e.id}`), i)}
            <span className="text-xs text-muted">{t(`look.eyes.${e.id}`)}</span>
          </span>
        ))}
      </LookRow>
      <LookRow label={t("look.extras")}>
        {chip("glasses", true, t("look.glasses"), "look-glasses")}
        {chip("freckles", true, t("look.freckles"), "look-freckles")}
      </LookRow>
    </div>
  );
}

function LookRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex flex-wrap items-start gap-2">{children}</div>
    </div>
  );
}

/** The look as the review lists it, in the page's language; empty when nothing was picked. */
export function useLookSummary(): (look: ChildLook | undefined) => string {
  const { t } = useI18n();
  return (look) => {
    if (!look) return "";
    const parts: string[] = [];
    if (look.skin) parts.push(t("look.skin.n", { n: SKIN_TONES.findIndex((s) => s.id === look.skin) + 1, total: SKIN_TONES.length }));
    if (look.hairColor) parts.push(t(`look.hair.${look.hairColor}`));
    if (look.hairLength) parts.push(t(`look.length.${look.hairLength}`));
    if (look.hairTexture) parts.push(t(`look.texture.${look.hairTexture}`));
    if (look.eyes) parts.push(`${t("look.eyes")}: ${t(`look.eyes.${look.eyes}`)}`);
    if (look.glasses) parts.push(t("look.glasses"));
    if (look.freckles) parts.push(t("look.freckles"));
    return parts.join(", ");
  };
}
