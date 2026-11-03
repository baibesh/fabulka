"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  REFERENCE_ERRORS,
  REFERENCE_KINDS,
  REFERENCE_MAX_BYTES,
  REFERENCE_SLOT_LIMITS,
  REFERENCE_TYPES,
  methodologyText,
  sameSlot,
  slotOf,
  type IllustratorReference,
  type ReferenceError,
  type ReferenceKind,
  type ReferenceSlot,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, Check, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { tabPanelProps, Tabs, useTabsId } from "@/components/ui/tabs";
import { adminReferences, adminThemes, deleteReference, pageFlags, reorderReferences, resolveFlag, updateReference, uploadReference } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { themeName } from "@/lib/themes";
import { Card, PageTitle, useAdminI18n } from "./ui";
import { useAdminMethodologies } from "./use-methodologies";
import { useAdminHref, useCan } from "./working-country";

const QUERY = ["admin", "references"];
const FLAGS_QUERY = ["admin", "flags"];
const TABS = ["pictures", "flags"] as const;
type Tab = (typeof TABS)[number];

/** A References refusal in the admin's words, else its message. */
function useReferenceError() {
  const { t } = useAdminI18n();
  return (error: Error | null) => {
    if (!error) return null;
    if (error instanceof ApiError && (REFERENCE_ERRORS as readonly string[]).includes(error.code ?? "")) {
      return t(`admin.references.error.${error.code as ReferenceError}`);
    }
    return error.message;
  };
}

/**
 * /admin/references: the pictures illustrators prepare for Muse Image — a theme's style, a method
 * beat's staging sketch, the character proportion guide — and the pages they flagged in review.
 * Generation sends the enabled pictures of a slot in their order; they guide style and composition
 * only, never the child's face or clothes.
 */
export function ReferencesPage() {
  const { t } = useAdminI18n();
  const tabs = useTabsId();
  const [tab, setTab] = useState<Tab>("pictures");
  const canEdit = useCan("references");
  const shown = canEdit ? TABS : (["flags"] as const);
  const current = shown.includes(tab as never) ? tab : shown[0];
  return (
    <>
      <PageTitle>{t("admin.references.title")}</PageTitle>
      <p className="-mt-4 max-w-3xl text-sm text-muted">{t("admin.references.lead")}</p>
      <Tabs
        base={tabs}
        data-testid="references-tabs"
        value={current}
        onChange={setTab}
        items={shown.map((id) => ({ id, label: t(`admin.references.tab.${id}`), testId: `references-tab-${id}` }))}
      />
      <div {...tabPanelProps(tabs, current)} className="flex flex-col gap-6 outline-none">
        {current === "pictures" ? <Pictures /> : <Flags />}
      </div>
    </>
  );
}

/** The slots a picture can go to: style per theme, composition per method beat, the global guide. */
function useSlots() {
  const { t, locale } = useAdminI18n();
  const themes = useQuery({ queryKey: ["admin", "themes"], queryFn: adminThemes });
  const methods = useAdminMethodologies();
  const themeOptions = (themes.data ?? []).map((entry) => ({ id: entry.theme.id, name: themeName(entry.theme, t, locale) }));
  const methodOptions = (methods.data ?? []).map((m) => ({ slug: m.slug, name: methodologyText(m.texts, locale).name || m.slug, beats: m.structure }));
  const slotName = (slot: ReferenceSlot): string => {
    if (slot.kind === "style") return `${t("admin.references.kind.style")} · ${themeOptions.find((th) => th.id === slot.theme)?.name ?? slot.theme}`;
    if (slot.kind === "composition") {
      const method = methodOptions.find((m) => m.slug === slot.methodology);
      return `${t("admin.references.kind.composition")} · ${method?.name ?? slot.methodology} · ${t("admin.references.beat", { n: slot.beat ?? 0 })}`;
    }
    return t("admin.references.kind.character_guide");
  };
  const beatText = (slot: ReferenceSlot) =>
    slot.kind === "composition" ? (methodOptions.find((m) => m.slug === slot.methodology)?.beats[(slot.beat ?? 1) - 1] ?? null) : null;
  return { themeOptions, methodOptions, slotName, beatText, ready: !!themes.data && !!methods.data };
}

function Pictures() {
  const { t } = useAdminI18n();
  const refs = useQuery({ queryKey: QUERY, queryFn: adminReferences });
  const slots = useSlots();
  // Pictures grouped by slot, in the order the API lists them (each slot in its own order).
  const groups = useMemo(() => {
    const out: { slot: ReferenceSlot; items: IllustratorReference[] }[] = [];
    for (const ref of refs.data ?? []) {
      const slot = slotOf(ref);
      const group = out.find((g) => sameSlot(g.slot, slot));
      if (group) group.items.push(ref);
      else out.push({ slot, items: [ref] });
    }
    return out;
  }, [refs.data]);
  return (
    <>
      <UploadCard slots={slots} />
      {!refs.data ? (
        <QueryState error={refs.error} scope="admin" />
      ) : groups.length === 0 ? (
        <p data-testid="references-empty" className="text-sm text-muted">
          {t("admin.references.empty")}
        </p>
      ) : (
        <div data-testid="references-list" className="flex flex-col gap-4">
          {groups.map((group) => (
            <SlotCard key={`${group.slot.kind}:${group.slot.theme}:${group.slot.methodology}:${group.slot.beat}`} group={group} slots={slots} />
          ))}
        </div>
      )}
    </>
  );
}

function UploadCard({ slots }: { slots: ReturnType<typeof useSlots> }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useReferenceError();
  const [kind, setKind] = useState<ReferenceKind>("style");
  const [theme, setTheme] = useState("");
  const [methodology, setMethodology] = useState("");
  const [beat, setBeat] = useState(1);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const themeId = theme || slots.themeOptions[0]?.id || "";
  const methodSlug = methodology || slots.methodOptions[0]?.slug || "";
  const beats = slots.methodOptions.find((m) => m.slug === methodSlug)?.beats ?? [];
  const upload = useMutation({
    mutationFn: async () => {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("read"));
        reader.readAsDataURL(file!);
      });
      return uploadReference({ kind, theme: themeId, methodology: methodSlug, beat: Math.min(beat, beats.length || 1), note, image });
    },
    onSuccess: () => {
      setNote("");
      setFile(null);
      if (input.current) input.current.value = "";
      void queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });
  return (
    <Card title={t("admin.references.upload")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) upload.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("admin.references.kind")}>
            <Select data-testid="ref-kind" value={kind} onChange={(e) => setKind(e.target.value as ReferenceKind)}>
              {REFERENCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin.references.kind.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "style" && (
            <Field label={t("admin.references.theme")}>
              <Select data-testid="ref-theme" value={themeId} onChange={(e) => setTheme(e.target.value)}>
                {slots.themeOptions.map((th) => (
                  <option key={th.id} value={th.id}>
                    {th.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "composition" && (
            <>
              <Field label={t("admin.references.method")}>
                <Select data-testid="ref-method" value={methodSlug} onChange={(e) => setMethodology(e.target.value)}>
                  {slots.methodOptions.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("admin.references.beatField")}>
                <Select data-testid="ref-beat" value={String(beat)} onChange={(e) => setBeat(Number(e.target.value))}>
                  {beats.map((text, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}. {text.length > 60 ? `${text.slice(0, 57)}…` : text}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label={t("admin.references.note")}>
            <Input data-testid="ref-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-muted">{t(`admin.references.hint.${kind}`)}</p>
        <Field label={t("admin.references.file")} hint={t("admin.references.file.hint", { mb: REFERENCE_MAX_BYTES / 1024 / 1024, n: REFERENCE_SLOT_LIMITS[kind] })}>
          <input
            ref={input}
            type="file"
            data-testid="ref-file"
            accept={REFERENCE_TYPES.join(",")}
            className="text-sm"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              const bad = picked && (!(REFERENCE_TYPES as readonly string[]).includes(picked.type) || picked.size > REFERENCE_MAX_BYTES);
              setFileProblem(bad ? t("admin.references.error.reference_bad_image") : null);
              setFile(bad ? null : picked);
            }}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" data-testid="ref-upload" loading={upload.isPending} disabled={!file || !slots.ready} icon={<ImagePlus className="size-4" />}>
            {t("admin.references.upload.submit")}
          </Button>
          {upload.isSuccess && (
            <span data-testid="ref-uploaded" className="text-sm text-success">
              {t("admin.references.upload.done")}
            </span>
          )}
        </div>
        {(fileProblem || upload.isError) && <ErrorText data-testid="ref-error">{fileProblem ?? errorText(upload.error)}</ErrorText>}
      </form>
    </Card>
  );
}

function SlotCard({ group, slots }: { group: { slot: ReferenceSlot; items: IllustratorReference[] }; slots: ReturnType<typeof useSlots> }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useReferenceError();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY });
  const update = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateReference(id, { enabled }), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: reorderReferences, onSuccess: refresh });
  const remove = useMutation({ mutationFn: deleteReference, onSuccess: refresh });
  const ids = group.items.map((r) => r.id);
  const move = (index: number, by: number) => {
    const next = [...ids];
    const [id] = next.splice(index, 1);
    next.splice(index + by, 0, id);
    reorder.mutate(next);
  };
  const beat = slots.beatText(group.slot);
  const error = update.error ?? reorder.error ?? remove.error;
  return (
    <Card
      title={slots.slotName(group.slot)}
      action={
        <span className="text-sm text-muted">
          {t("admin.references.count", { n: group.items.length, max: REFERENCE_SLOT_LIMITS[group.slot.kind] })}
        </span>
      }
      data-testid="ref-slot"
      data-kind={group.slot.kind}
    >
      {beat && <p className="-mt-2 text-sm text-muted">{beat}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {group.items.map((ref, i) => (
          <li key={ref.id} data-testid="ref-item" data-id={ref.id} data-enabled={ref.enabled} className={`flex flex-col overflow-hidden rounded-xl border border-border ${ref.enabled ? "" : "opacity-60"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored files, served by the API */}
            <img src={ref.imageUrl} alt="" className="aspect-[3/2] w-full bg-background object-contain" />
            <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
              {ref.note && <p>{ref.note}</p>}
              <p className="text-xs text-muted">
                {ref.width}×{ref.height} · {Math.round(ref.bytes / 1024)} KB{ref.createdBy ? ` · ${ref.createdBy}` : ""}
              </p>
              {i < 2 && ref.enabled && group.slot.kind === "style" && <Badge tone="accent">{t("admin.references.sent")}</Badge>}
              {i === 0 && ref.enabled && group.slot.kind !== "style" && <Badge tone="accent">{t("admin.references.sent")}</Badge>}
              <label className="flex items-center gap-2">
                <Checkbox data-testid="ref-enabled" checked={ref.enabled} onChange={(e) => update.mutate({ id: ref.id, enabled: e.target.checked })} />
                {t("admin.references.enabled")}
              </label>
              <div className="mt-auto flex flex-wrap gap-1">
                <IconButton label={t("admin.references.up")} data-testid="ref-up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label={t("admin.references.down")} data-testid="ref-down" disabled={i === group.items.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <Button size="sm" variant="danger-outline" data-testid="ref-delete" loading={remove.isPending && remove.variables === ref.id} onClick={() => remove.mutate(ref.id)} icon={<Trash2 className="size-4" />}>
                  {t("admin.delete")}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && <ErrorText>{errorText(error)}</ErrorText>}
    </Card>
  );
}

/** Pages illustrators flagged in review, open ones first; each links to its book. */
function Flags() {
  const { t, date } = useAdminI18n();
  const adminHref = useAdminHref();
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: FLAGS_QUERY, queryFn: pageFlags });
  const canResolve = useCan("books.review");
  const toggle = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => resolveFlag(id, resolved),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FLAGS_QUERY }),
  });
  if (!flags.data) return <QueryState error={flags.error} scope="admin" />;
  if (!flags.data.length)
    return (
      <p data-testid="flags-empty" className="text-sm text-muted">
        {t("admin.references.flags.empty")}
      </p>
    );
  return (
    <ul data-testid="flags-list" className="flex flex-col gap-2">
      {flags.data.map((flag) => (
        <li key={flag.id} data-testid="flag-item" data-resolved={flag.resolved} className={`rounded-xl border border-border p-3 text-sm ${flag.resolved ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={adminHref(`/admin/books/${flag.bookId}`)} className="font-semibold underline-offset-2 hover:underline">
              {flag.bookTitle ?? t("admin.untitled")}
            </Link>
            <Badge tone={flag.resolved ? "success" : "warning"}>{pageLabel(flag.page, t)}</Badge>
            <span className="text-muted">
              {date(flag.createdAt)}
              {flag.createdBy ? ` · ${flag.createdBy}` : ""}
            </span>
            {canResolve && (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                data-testid="flag-resolve"
                loading={toggle.isPending && toggle.variables?.id === flag.id}
                icon={flag.resolved ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
                onClick={() => toggle.mutate({ id: flag.id, resolved: !flag.resolved })}
              >
                {flag.resolved ? t("admin.references.flags.reopen") : t("admin.references.flags.resolve")}
              </Button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-line">{flag.note}</p>
        </li>
      ))}
    </ul>
  );
}

/** A page key in words: the cover, the back cover, page 3. */
export function pageLabel(page: string, t: ReturnType<typeof useAdminI18n>["t"]): string {
  if (page === "cover") return t("admin.flag.page.cover");
  if (page === "back") return t("admin.flag.page.back");
  const story = /^story-(\d+)/.exec(page);
  return story ? t("design.page", { page: Number(story[1]) }) : page;
}
