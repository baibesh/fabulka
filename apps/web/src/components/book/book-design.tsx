"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BLOCK_LIMITS,
  BOOK_LABELS,
  DEDICATION_MAX,
  PHOTO_CAPTION_MAX,
  PHOTO_REFUSED,
  PHOTO_REFUSALS,
  SELECTABLE_THEMES,
  BOOK_THEMES,
  availableVariants,
  planBook,
  type BlockKind,
  type Book,
  type PhotoRefusal,
  type UpdateLayout,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, ImagePlus, Lock, Palette, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, IconButton } from "../ui/button";
import { Input, Textarea } from "../ui/input";
import { useI18n } from "@/i18n/i18n";
import { ApiError, getThemes, updateLayout, uploadPhoto } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { themeName, themeNote } from "@/lib/themes";
import { PHOTO_ACCEPT, photoProblem, readDataUrl, shrinkPhoto } from "@/lib/photo-file";
import { Card } from "../ui/card";
import { ErrorText } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { Spinner } from "../ui/spinner";

/**
 * Before ordering, the parent may pick another theme, and for each page one of the 2–3 layouts
 * that suit its picture. Only the layout changes: the API re-renders the book (and its PDF) and
 * the reader shows the new pages.
 */
export function BookDesign({ book }: { book: Book }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  // The curated themes until the list (with the AI themes staff published) arrives.
  const themes = (useQuery({ queryKey: ["themes"], queryFn: getThemes, staleTime: 60_000 }).data ?? SELECTABLE_THEMES.map((id) => BOOK_THEMES[id])).filter(
    (theme) => theme.languages.includes(book.language),
  );
  const save = useMutation({
    mutationFn: (patch: UpdateLayout) => updateLayout(book.id, patch),
    onSuccess: (updated) => queryClient.setQueryData(["book", book.id], updated),
  });
  const current = book.layout.theme.id;
  // Pages with a real choice: the layouts that suit the picture and fit where the page falls.
  const pages = planBook(book, book.layout)
    .filter((p) => p.kind === "story" && p.part === 0)
    .map((p) => ({ page: p.story!, variant: p.variant!, options: availableVariants(book.layout.theme, book.layout.pages[String(p.story)], p.index) }))
    .filter((p) => p.options.length > 1);

  return (
    <Card data-testid="book-design" data-theme={current} aria-busy={save.isPending} className="flex flex-col gap-4">
      <SectionHeader size="md" icon={<Palette className="size-5 text-accent" />} title={t("design.title")} lead={t("design.hint")} />
      <div role="group" aria-label={t("design.theme")} className="grid gap-2 sm:grid-cols-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            data-testid={`theme-${theme.id}`}
            data-source={theme.source}
            aria-pressed={current === theme.id}
            disabled={save.isPending}
            onClick={() => current !== theme.id && save.mutate({ theme: theme.id })}
            className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:border-accent disabled:opacity-60 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/30"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <span aria-hidden className="size-3 shrink-0 rounded-full border border-border" style={{ background: theme.palette.accent }} />
              {themeName(theme, t, locale)}
            </span>
            <span className="text-xs text-muted">{themeNote(theme, t)}</span>
          </button>
        ))}
      </div>
      {pages.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">{t("design.pages")}</h3>
          <ul className="flex flex-col gap-2">
            {pages.map(({ page, variant, options }) => (
              <li key={page} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-muted">{t("design.page", { page })}</span>
                {options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`variant-${page}-${option}`}
                    aria-pressed={variant === option}
                    disabled={save.isPending}
                    onClick={() => variant !== option && save.mutate({ choices: { [String(page)]: option } })}
                    className="rounded-full border border-border px-3 py-1 transition hover:border-accent disabled:opacity-60 aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:font-semibold"
                  >
                    {t(`design.variant.${option}`)}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Blocks book={book} pending={save.isPending} onSave={(patch) => save.mutate(patch)} />
      {save.isPending && (
        <p data-testid="design-saving" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          {t("design.saving")}
        </p>
      )}
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
    </Card>
  );
}

/**
 * The book's blocks in order: the parent moves the ones the template lets move (never past the cover
 * or the end, and the story pages never reorder), leaves out optional ones, adds the ones offered,
 * and writes their own dedication. Drawing pages that only make the count a multiple of 4 are
 * counted here and marked in the reader.
 */
function Blocks({ book, pending, onSave }: { book: Book; pending: boolean; onSave: (patch: UpdateLayout) => void }) {
  const { t } = useI18n();
  const { blocks, addable } = book.layout;
  const kinds = blocks.map((b) => b.kind);
  const plan = planBook(book, book.layout);
  const fillers = plan.filter((p) => p.filler).length;
  const move = (index: number, by: -1 | 1) => {
    const next = [...kinds];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onSave({ blocks: next });
  };
  const canMove = (index: number, by: -1 | 1) => {
    const to = index + by;
    return blocks[index].movable && to > 0 && to < blocks.length - 1 && blocks[to].kind !== "cover" && blocks[to].kind !== "end";
  };
  const add = (kind: BlockKind) => {
    const next = [...kinds];
    next.splice(next.lastIndexOf("end"), 0, kind);
    onSave({ blocks: next });
  };
  const offered = addable.filter((kind) => kinds.filter((k) => k === kind).length < BLOCK_LIMITS[kind]);

  return (
    <div data-testid="book-blocks" className="flex flex-col gap-3">
      <h3 className="text-sm font-bold">{t("design.blocks")}</h3>
      <ol className="flex flex-col gap-1.5">
        {blocks.map((block, i) => (
          <li
            key={`${block.kind}-${i}`}
            data-testid="block-row"
            data-kind={block.kind}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm"
          >
            <span className="w-6 text-right text-muted">{i + 1}</span>
            <span className="flex-1 font-medium">
              {block.kind === "story" ? t("design.block.story", { count: book.pages.length }) : t(`design.block.${block.kind}`)}
              {block.kind === "photo" && !book.layout.photo && <span className="ml-2 text-xs font-normal text-muted">{t("design.photo.empty")}</span>}
            </span>
            {block.movable && (
              <>
                <IconButton data-testid={`block-up-${i}`} label={t("design.block.up")} disabled={pending || !canMove(i, -1)} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton data-testid={`block-down-${i}`} label={t("design.block.down")} disabled={pending || !canMove(i, 1)} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
              </>
            )}
            {block.optional && (
              <IconButton
                data-testid={`block-remove-${i}`}
                variant="danger"
                label={t("design.block.remove")}
                disabled={pending}
                onClick={() => onSave({ blocks: kinds.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ol>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offered
            .filter((kind) => kind !== "photo")
            .map((kind) => (
              <Button key={kind} variant="secondary" size="sm" data-testid={`block-add-${kind}`} disabled={pending} icon={<Plus className="size-4" />} onClick={() => add(kind)}>
                {t(`design.block.add.${kind}`)}
              </Button>
            ))}
        </div>
      )}
      <p data-testid="page-count" data-count={plan.length} data-fillers={fillers} className="text-sm text-muted">
        {t("design.pageCount", { count: plan.length })}
        {fillers > 0 && <span data-testid="padding-note"> {t("design.padding", { count: fillers })}</span>}
      </p>
      {kinds.includes("dedication") && <Dedication key={book.layout.dedication ?? ""} book={book} pending={pending} onSave={onSave} />}
      {(kinds.includes("photo") || offered.includes("photo")) && <PhotoPage book={book} pending={pending} onSave={onSave} />}
    </div>
  );
}

/** The dedication page's text: the parent's own words (plain text), or back to the default one. */
function Dedication({ book, pending, onSave }: { book: Book; pending: boolean; onSave: (patch: UpdateLayout) => void }) {
  const { t } = useI18n();
  const fallback = BOOK_LABELS[book.language].madeFor(book.childName);
  const [text, setText] = useState(book.layout.dedication ?? fallback);
  const trimmed = text.replace(/\s+/g, " ").trim();
  const invalid = !trimmed || /[<>]/.test(trimmed);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="dedication" className="text-sm font-bold">
        {t("design.dedication")}
      </label>
      <Textarea
        id="dedication"
        data-testid="dedication-input"
        className="min-h-20"
        maxLength={DEDICATION_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t("design.dedication.limit", { count: DEDICATION_MAX - text.length })}</span>
        {/[<>]/.test(text) && <span className="text-danger">{t("design.dedication.markup")}</span>}
        <span className="flex-1" />
        {book.layout.dedication && (
          <Button variant="ghost" size="sm" data-testid="dedication-reset" disabled={pending} onClick={() => onSave({ dedication: null })}>
            {t("design.dedication.reset")}
          </Button>
        )}
        <Button
          size="sm"
          data-testid="dedication-save"
          disabled={pending || invalid || trimmed === (book.layout.dedication ?? fallback)}
          onClick={() => onSave({ dedication: trimmed })}
        >
          {t("design.dedication.save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The photo page: the parent picks a photo of the child (JPEG, PNG or HEIC up to 7 MB; bigger JPEG/PNG are shrunk first), which the API
 * re-encodes without metadata and puts in a frame in the theme's colors, with an optional caption.
 * Uploading adds the page; taking the page out (the bin in the list) deletes the photo. The privacy
 * note says what happens to the photo.
 */
function PhotoPage({ book, pending, onSave }: { book: Book; pending: boolean; onSave: (patch: UpdateLayout) => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<PhotoRefusal | null>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => uploadPhoto(book.id, await readDataUrl(file)),
    onSuccess: (updated) => queryClient.setQueryData(["book", book.id], updated),
    onError: (error) => {
      const reason = error instanceof ApiError && error.code === PHOTO_REFUSED ? (error.body as { reason?: string } | undefined)?.reason : undefined;
      setProblem((PHOTO_REFUSALS as readonly string[]).includes(reason ?? "") ? (reason as PhotoRefusal) : "decode");
    },
  });
  const photo = book.layout.photo;
  const busy = pending || upload.isPending;
  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    const file = await shrinkPhoto(picked);
    const found = photoProblem(file);
    setProblem(found);
    if (!found) upload.mutate(file);
  };
  return (
    <div data-testid="photo-page" data-has-photo={photo ? "true" : "false"} className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <h4 className="text-sm font-bold">{t("design.photo.title")}</h4>
      <div className="flex flex-wrap items-center gap-3">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- the stored photo, shown small.
          <img data-testid="photo-thumb" src={`/files/${photo.path}`} alt={t("design.photo.alt")} className="h-20 rounded-lg border border-border object-cover" />
        )}
        <input
          ref={input}
          type="file"
          data-testid="photo-input"
          className="sr-only"
          tabIndex={-1}
          accept={PHOTO_ACCEPT}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          data-testid="photo-upload"
          loading={upload.isPending}
          disabled={busy}
          icon={<ImagePlus className="size-4" />}
          onClick={() => input.current?.click()}
        >
          {photo ? t("design.photo.replace") : t("design.photo.upload")}
        </Button>
        <span className="text-xs text-muted">{t("design.photo.hint")}</span>
      </div>
      {upload.isPending && <p className="text-sm text-muted">{t("design.photo.uploading")}</p>}
      {problem && (
        <ErrorText data-testid="photo-error" data-reason={problem}>
          {t(`design.photo.error.${problem}`)}
        </ErrorText>
      )}
      <p data-testid="photo-privacy" className="flex gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {t("design.photo.privacy")}
      </p>
      {photo && <PhotoCaption key={photo.caption ?? ""} caption={photo.caption} pending={busy} onSave={onSave} />}
    </div>
  );
}

function PhotoCaption({ caption, pending, onSave }: { caption: string | null; pending: boolean; onSave: (patch: UpdateLayout) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(caption ?? "");
  const trimmed = text.replace(/\s+/g, " ").trim();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="photo-caption" className="text-sm font-bold">
        {t("design.photo.caption")}
      </label>
      <Input id="photo-caption" data-testid="photo-caption" maxLength={PHOTO_CAPTION_MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t("design.dedication.limit", { count: PHOTO_CAPTION_MAX - text.length })}</span>
        {/[<>]/.test(text) && <span className="text-danger">{t("design.dedication.markup")}</span>}
        <span className="flex-1" />
        {caption && (
          <Button variant="ghost" size="sm" data-testid="photo-caption-remove" disabled={pending} onClick={() => onSave({ photoCaption: null })}>
            {t("design.photo.caption.remove")}
          </Button>
        )}
        <Button
          size="sm"
          data-testid="photo-caption-save"
          disabled={pending || !trimmed || /[<>]/.test(trimmed) || trimmed === (caption ?? "")}
          onClick={() => onSave({ photoCaption: trimmed })}
        >
          {t("design.photo.caption.save")}
        </Button>
      </div>
    </div>
  );
}
