"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DEFAULT_LANDING_IMAGES,
  LANDING_IMAGE_MAX_BYTES,
  LANDING_IMAGE_SLOTS,
  LANGUAGE_NAMES,
  SCOPE_FORBIDDEN,
  landingPicture,
  type AdminReference,
  type CountryLanding,
  type LandingImageLanguage,
  type LandingImageSlot,
  type Language,
} from "@fabulka/shared";
import { BookImage, ExternalLink, ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cx } from "@/components/ui/cx";
import { ApiError } from "@/lib/api";
import { clearLandingImage, landingBooks, saveLandingImage } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, useSaved } from "./shared";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The admin link that opens the site as a visitor from `country` reading `language` (a new tab). */
export function previewHref(country: string, language: Language): string {
  return `/admin/preview?${new URLSearchParams({ country, lang: language })}`;
}

/** "Preview as a visitor" links, one per language, opening the site in a new tab. */
export function PreviewLinks({ country, languages, testId = "preview-visitor" }: { country: string; languages: readonly Language[]; testId?: string }) {
  const { t } = useAdminI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">{t("admin.preview.label")}</span>
      {languages.map((language) => (
        <a
          key={language}
          href={previewHref(country, language)}
          target="_blank"
          rel="noopener"
          data-testid={`${testId}-${language}`}
          title={t("admin.preview.title", { language: LANGUAGE_NAMES[language] })}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {LANGUAGE_NAMES[language]}
        </a>
      ))}
    </div>
  );
}

/**
 * The country's landing pictures: for each slot (the hero, the toy story's three steps) one for all
 * its languages and one per language, each uploaded or taken from a finished book, previewed, and
 * reset to the default. Saved at once (each change is in Activity), apart from the form below.
 */
export function LandingImages({ reference, country, languages }: { reference: AdminReference; country: string; languages: readonly Language[] }) {
  const { t } = useAdminI18n();
  const own = reference.landing[country];
  return (
    <Card title={t("admin.reference.landing.images")} data-testid="landing-images" data-country={country}>
      <p className="-mt-2 text-sm text-muted">{t("admin.reference.landing.images.hint")}</p>
      {LANDING_IMAGE_SLOTS.map((slot) => (
        <section key={slot} data-testid={`landing-slot-${slot}`} className="flex flex-col gap-2">
          <h3 className="font-bold">{t(`admin.reference.landing.image.${slot}`)}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["all", ...languages] as LandingImageLanguage[]).map((language) => (
              <ImageTile key={language} reference={reference} country={country} own={own} slot={slot} language={language} />
            ))}
          </div>
        </section>
      ))}
    </Card>
  );
}

function ImageTile({
  reference,
  country,
  own,
  slot,
  language,
}: {
  reference: AdminReference;
  country: string;
  own: CountryLanding | undefined;
  slot: LandingImageSlot;
  language: LandingImageLanguage;
}) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const set = own?.images?.[slot];
  const image = set?.[language];
  // What this tile's visitors see now: its own picture, else (a language) the country's for all languages, else the default.
  const inherited = !image && language !== "all" ? set?.all : undefined;
  const shown = image ?? inherited;
  const fallback = DEFAULT_LANDING_IMAGES[slot];
  const done = (landing: CountryLanding | null) => {
    const rest = { ...reference.landing };
    if (landing) rest[country] = landing;
    else delete rest[country];
    saved({ landing: rest });
    setProblem(null);
  };
  const failed = (error: unknown) =>
    setProblem(error instanceof ApiError && error.code === SCOPE_FORBIDDEN ? t("admin.scope.forbidden") : t("admin.reference.landing.image.error"));
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("read"));
        reader.readAsDataURL(file);
      });
      return saveLandingImage(country, { slot, language, image: data });
    },
    onSuccess: (landing) => {
      done(landing);
      if (input.current) input.current.value = "";
    },
    onError: failed,
  });
  const pick = useMutation({
    mutationFn: (book: { id: string; picture: string }) => saveLandingImage(country, { slot, language, book }),
    onSuccess: (landing) => {
      done(landing);
      setPicking(false);
    },
    onError: failed,
  });
  const reset = useMutation({ mutationFn: () => clearLandingImage(country, slot, language), onSuccess: done, onError: failed });
  const busy = upload.isPending || pick.isPending || reset.isPending;
  const testId = `landing-image-${slot}-${language}`;

  return (
    <div
      data-testid={testId}
      data-own={image ? "true" : "false"}
      data-src={shown ? landingPicture(shown).src : (fallback ?? "")}
      className="flex flex-col gap-2 rounded-xl bg-background p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{language === "all" ? t("admin.reference.landing.image.all") : LANGUAGE_NAMES[language]}</span>
        <Badge tone={image ? "success" : "neutral"}>
          {image ? t("admin.reference.landing.image.own") : inherited ? t("admin.reference.landing.image.inherited") : t("admin.reference.landing.image.default")}
        </Badge>
      </div>
      <div className={cx("relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-white", !image && "opacity-80")}>
        {shown || fallback ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored files at fixed widths, or the default file
          <img
            src={shown ? landingPicture(shown).src : fallback!}
            srcSet={shown ? landingPicture(shown).srcSet : undefined}
            sizes={shown ? "12rem" : undefined}
            alt=""
            loading="lazy"
            data-testid={`${testId}-preview`}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center p-3 text-center text-xs text-muted">{t("admin.reference.landing.image.covers")}</span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        data-testid={`${testId}-file`}
        aria-label={t("admin.reference.landing.image.upload")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!TYPES.includes(file.type) || file.size > LANDING_IMAGE_MAX_BYTES) {
            setProblem(t("admin.reference.landing.image.bad", { mb: LANDING_IMAGE_MAX_BYTES / 1024 / 1024 }));
            return;
          }
          upload.mutate(file);
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button variant="secondary" size="sm" loading={upload.isPending} disabled={busy} icon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()}>
          {t("admin.reference.landing.image.upload")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid={`${testId}-pick`}
          disabled={busy}
          icon={<BookImage className="size-4" />}
          onClick={() => setPicking(true)}
        >
          {t("admin.reference.landing.image.pick")}
        </Button>
        {image && (
          <Button variant="ghost" size="sm" data-testid={`${testId}-reset`} loading={reset.isPending} disabled={busy} icon={<RotateCcw className="size-4" />} onClick={() => reset.mutate()}>
            {t("admin.reference.landing.image.reset")}
          </Button>
        )}
      </div>
      {problem && (
        <p data-testid={`${testId}-error`} className={errorText}>
          {problem}
        </p>
      )}
      <BookPicker open={picking} country={country} pending={pick.isPending} onClose={() => setPicking(false)} onPick={(book) => pick.mutate(book)} testId={`${testId}-picker`} />
    </div>
  );
}

/** Finished books (the examples, the country's and the global catalog samples) and their pictures to pick from. */
function BookPicker({
  open,
  country,
  pending,
  onClose,
  onPick,
  testId,
}: {
  open: boolean;
  country: string;
  pending: boolean;
  onClose: () => void;
  onPick: (book: { id: string; picture: string }) => void;
  testId: string;
}) {
  const { t } = useAdminI18n();
  const books = useQuery({ queryKey: ["admin", "landing-books", country], queryFn: () => landingBooks(country), enabled: open });
  return (
    <Dialog open={open} onClose={onClose} title={t("admin.reference.landing.image.pick")} closeLabel={t("admin.close")} testId={testId}>
      {!books.data ? (
        <p className="text-sm text-muted">{books.error ? t("admin.reference.landing.image.error") : "…"}</p>
      ) : books.data.length === 0 ? (
        <p className="text-sm text-muted">{t("admin.reference.landing.image.noBooks")}</p>
      ) : (
        <ul className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          {books.data.map((book) => (
            <li key={book.id} data-testid="landing-book" data-book-id={book.id} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                {book.title} <span className="font-normal text-muted">· {LANGUAGE_NAMES[book.language]}</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {book.pictures.map((picture) => (
                  <button
                    key={picture.key}
                    type="button"
                    disabled={pending}
                    data-testid={`landing-book-picture-${picture.key}`}
                    aria-label={`${book.title}: ${picture.key}`}
                    onClick={() => onPick({ id: book.id, picture: picture.key })}
                    className="size-20 overflow-hidden rounded-lg border border-border bg-white hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API */}
                    <img src={picture.url} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
