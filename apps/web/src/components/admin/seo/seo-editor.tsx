"use client";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_NAMES,
  LanguageSchema,
  SEO_DESCRIPTION_LIMIT,
  SEO_IMAGE_MAX_BYTES,
  SEO_TITLE_LIMIT,
  SeoFieldsSchema,
  localePath,
  sameSeoFields,
  type AdminSeoPage,
  type Language,
  type SeoFields,
  type SeoHistoryEntry,
} from "@fabulka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, ImagePlus, Save, Send, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Flag } from "@/components/ui/flag";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorText, Notice } from "@/components/ui/notice";
import { BackLink } from "@/components/ui/page";
import { QueryState } from "@/components/ui/query-state";
import { publishSeo, revertSeo, saveSeoPage, seoHistory, seoPage, uploadSeoImage } from "@/lib/admin-api";
import { LANGUAGE_FLAGS } from "@/lib/regions";
import { defaultSeo, resolveSeo } from "@/lib/seo-meta";
import { Card, PageTitle, useAdminI18n } from "../ui";
import { Counter, GooglePreview, HistoryList, SocialPreview, seoWarnings } from "./shared";
import { useAdminHref } from "../working-country";

/** /admin/seo/edit?key=catalog&version=de: one page's SEO in one language, with live previews and its history. */
export function SeoEditor() {
  const params = useSearchParams();
  const key = params.get("key") ?? "home";
  const language = LanguageSchema.catch(DEFAULT_LANGUAGE).parse(params.get("version"));
  const page = useQuery({ queryKey: ["admin", "seo", "page", key, language], queryFn: () => seoPage(key, language) });
  if (!page.data) return <QueryState error={page.error} scope="admin" />;
  return <Editor key={`${key}:${language}`} page={page.data} language={language} />;
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function Editor({ page, language }: { page: AdminSeoPage; language: Language }) {
  const adminHref = useAdminHref();
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SeoFields>(page.draft);
  const [imageError, setImageError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SeoFields>(field: K, value: SeoFields[K]) => setDraft((d) => ({ ...d, [field]: value }));

  const parsed = SeoFieldsSchema.safeParse(draft);
  const fields = parsed.success ? parsed.data : draft;
  const dirty = !sameSeoFields(fields, page.draft);
  const subject = { key: page.key, label: page.label, summary: page.summary, coverUrl: page.coverUrl };
  const defaults = defaultSeo(language, subject);
  const seo = resolveSeo(language, subject, {
    title: fields.title,
    description: fields.description,
    ogImageUrl: fields.ogImage ? `/files/${fields.ogImage}` : null,
    noindex: fields.noindex,
  });
  const warnings = seoWarnings(seo);
  const history = useQuery({ queryKey: ["admin", "seo", "history", page.key, language], queryFn: () => seoHistory({ key: page.key, language }) });

  const refresh = (saved: AdminSeoPage) => {
    queryClient.setQueryData(["admin", "seo", "page", page.key, language], saved);
    void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "pages"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "pending"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "history", page.key, language] });
  };
  const save = useMutation({
    mutationFn: () => saveSeoPage({ key: page.key, language, fields }),
    onSuccess: (saved) => {
      refresh(saved);
      setDraft(saved.draft);
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await saveSeoPage({ key: page.key, language, fields });
      const result = await publishSeo({ key: page.key, language });
      const saved = await seoPage(page.key, language);
      refresh(saved);
      setDraft(saved.draft);
      return result;
    },
  });
  // The values from before that change come back into the form (and the stored draft).
  const revert = useMutation({
    mutationFn: (entry: SeoHistoryEntry) => revertSeo(entry.id),
    onSuccess: (saved) => {
      refresh(saved);
      setDraft(saved.draft);
      save.reset();
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > SEO_IMAGE_MAX_BYTES) throw new Error(t("admin.seo.og.tooBig"));
      return uploadSeoImage(await fileToDataUrl(file));
    },
    onSuccess: (image) => set("ogImage", image.path),
    onError: () => setImageError(true),
  });

  const live = page.published;
  const siteUrl = localePath(language, page.path);
  const title = page.kind === "static" ? t(`admin.seo.page.${page.key as "home" | "catalog" | "create" | "privacy" | "terms"}`) : (page.label ?? page.key);

  return (
    <div data-testid="seo-editor" className="flex flex-col gap-6">
      <BackLink href={adminHref(`/admin/seo?version=${language}`)}>{t("admin.seo.back")}</BackLink>
      <PageTitle
        aside={
          <div className="flex flex-wrap items-center gap-3">
            {save.isSuccess && !dirty && (
              <span data-testid="seo-saved" className="text-sm text-success">
                {t("admin.seo.savedDraft")}
              </span>
            )}
            {publish.isSuccess && (
              <span data-testid="seo-page-published" className="text-sm text-success">
                {t("admin.seo.publishedPage")}
              </span>
            )}
            <Button variant="secondary" data-testid="seo-save" loading={save.isPending} disabled={!dirty || !parsed.success} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
              {t("admin.seo.save")}
            </Button>
            <Button data-testid="seo-publish" loading={publish.isPending} disabled={!parsed.success || (!dirty && !page.pending)} icon={<Send className="size-4" />} onClick={() => publish.mutate()}>
              {t("admin.seo.publish")}
            </Button>
          </div>
        }
      >
        <span className="flex items-center gap-2">
          <Flag code={LANGUAGE_FLAGS[language]} />
          {title}
        </span>
      </PageTitle>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{LANGUAGE_NAMES[language]}</span>·
        <a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">
          {siteUrl}
          <ExternalLink className="size-3" />
        </a>
        {page.pending || dirty ? (
          <Badge tone="warning" data-testid="seo-state-pending">
            {t("admin.seo.status.pending")}
          </Badge>
        ) : live ? (
          <Badge tone="success" data-testid="seo-state-live">
            {t("admin.seo.status.live")}
          </Badge>
        ) : null}
      </div>
      {save.isError && <ErrorText>{save.error.message}</ErrorText>}
      {publish.isError && <ErrorText>{publish.error.message}</ErrorText>}
      {publish.isSuccess && !publish.data.revalidated && <Notice tone="warning">{t("admin.seo.notRevalidated")}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("admin.seo.card.fields")}>
          <Field
            label={
              <span className="flex items-center justify-between gap-2">
                {t("admin.seo.field.title")}
                <Counter length={seo.title.length} limit={SEO_TITLE_LIMIT} testId="seo-title-count" />
              </span>
            }
            hint={fields.title ? undefined : t("admin.seo.usesDefault")}
          >
            <Input data-testid="seo-title" value={draft.title ?? ""} placeholder={defaults.title ?? ""} maxLength={200} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between gap-2">
                {t("admin.seo.field.description")}
                <Counter length={seo.description.length} limit={SEO_DESCRIPTION_LIMIT} testId="seo-description-count" />
              </span>
            }
            hint={fields.description ? undefined : t("admin.seo.usesDefault")}
          >
            <Textarea
              data-testid="seo-description"
              className="min-h-24"
              value={draft.description ?? ""}
              placeholder={defaults.description ?? ""}
              maxLength={500}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{t("admin.seo.field.ogImage")}</span>
            <p className="text-xs text-muted">{t(`admin.seo.og.source.${seo.source.image}`)}</p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                data-testid="seo-og-file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setImageError(false);
                  if (file) upload.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" size="sm" data-testid="seo-og-upload" loading={upload.isPending} icon={<ImagePlus className="size-4" />} onClick={() => fileInput.current?.click()}>
                {t("admin.seo.og.upload")}
              </Button>
              {fields.ogImage && (
                <Button variant="danger-outline" size="sm" data-testid="seo-og-remove" icon={<Trash2 className="size-4" />} onClick={() => set("ogImage", null)}>
                  {t("admin.seo.og.remove")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{t("admin.seo.og.hint")}</p>
            {imageError && <ErrorText className="text-sm">{upload.error?.message ?? t("admin.seo.og.failed")}</ErrorText>}
          </div>
          <ChoiceLabel strong>
            <Checkbox data-testid="seo-noindex" checked={draft.noindex} onChange={(e) => set("noindex", e.target.checked)} />
            {t("admin.seo.field.noindex")}
          </ChoiceLabel>
          <p className="-mt-2 text-xs text-muted">{t("admin.seo.noindexHint")}</p>
          {warnings.length > 0 && (
            <ul data-testid="seo-warnings" className="flex flex-col gap-1 text-sm text-warning">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t(warning, { title: SEO_TITLE_LIMIT, description: SEO_DESCRIPTION_LIMIT })}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <GooglePreview language={language} pageKey={page.key} seo={seo} />
          <SocialPreview seo={seo} />
        </div>
      </div>

      <Card title={t("admin.seo.history.title")}>
        <p className="text-sm text-muted">{t("admin.seo.history.hint")}</p>
        {revert.isError && <ErrorText>{revert.error.message}</ErrorText>}
        {!history.data ? (
          <QueryState error={history.error} scope="admin" />
        ) : (
          <HistoryList entries={history.data} reverting={revert.isPending ? (revert.variables?.id ?? null) : null} onRevert={(entry) => revert.mutate(entry)} />
        )}
      </Card>
    </div>
  );
}
