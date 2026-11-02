"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  displayVersion,
  isExampleError,
  showcaseCountries,
  type AdminExample,
  type AdminExampleVersion,
  type Language,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, Languages, RotateCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { adminExamples, removeExample, removeExampleVersion, reorderExamples, translateExample, updateExample } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { useCountryName } from "@/hooks/use-country-name";
import { Flag } from "@/components/ui/flag";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Spinner } from "@/components/ui/spinner";
import { cx } from "@/components/ui/cx";
import { CountriesField } from "./countries-field";
import { Card, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";

/** The admin's examples list (also read by a book's page, which offers to add the book to one). */
export const EXAMPLES_QUERY = ["admin", "examples"] as const;

/** An API refusal in the admin's words (admin.examples.error.<code>), else its message. */
export function useExampleError() {
  const { t } = useAdminI18n();
  return (error: Error | null) => {
    if (!error) return null;
    if (error instanceof ApiError && isExampleError(error.code)) return t(`admin.examples.error.${error.code}`);
    return error.message;
  };
}

/**
 * «Examples»: the stories on the home page, in its order. Each shows its version in the admin's
 * language (else the first finished one), a chip per language — finished, being translated, failed
 * or missing, with «Translate» for the missing ones —, the countries it shows in, and ways to move
 * or remove it. While a translation runs the list refreshes itself.
 */
export function ExamplesPage() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useExampleError();
  const examples = useQuery({
    queryKey: EXAMPLES_QUERY,
    queryFn: adminExamples,
    refetchInterval: (query) => (query.state.data?.some((e) => e.versions.some((v) => v.state === "translating")) ? 2000 : false),
  });
  const reorder = useMutation({
    mutationFn: reorderExamples,
    onSuccess: (list) => queryClient.setQueryData(EXAMPLES_QUERY, list),
  });

  const list = examples.data;
  const move = (index: number, by: -1 | 1) => {
    if (!list) return;
    const ids = list.map((e) => e.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <>
      <PageTitle>{t("admin.examples.title")}</PageTitle>
      <p className="max-w-3xl text-sm text-muted">{t("admin.examples.lead")}</p>
      {!list && <QueryState error={examples.error} scope="admin" />}
      {reorder.isError && <ErrorText>{errorText(reorder.error)}</ErrorText>}
      {list?.length === 0 && (
        <p data-testid="examples-empty" className="text-muted">
          {t("admin.examples.empty")}
        </p>
      )}
      <ol data-testid="examples-list" className="flex flex-col gap-4">
        {list?.map((example, index) => (
          <li key={example.id}>
            <ExampleCard
              example={example}
              first={index === 0}
              last={index === list.length - 1}
              moving={reorder.isPending}
              onMove={(by) => move(index, by)}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

function ExampleCard({
  example,
  first,
  last,
  moving,
  onMove,
}: {
  example: AdminExample;
  first: boolean;
  last: boolean;
  moving: boolean;
  onMove: (by: -1 | 1) => void;
}) {
  const { t, locale } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useExampleError();
  const [confirming, setConfirming] = useState<"example" | Language | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: EXAMPLES_QUERY });
  const replace = (updated: AdminExample) =>
    queryClient.setQueryData<AdminExample[]>(EXAMPLES_QUERY, (list) => list?.map((e) => (e.id === updated.id ? updated : e)));

  const translate = useMutation({ mutationFn: (languages: Language[]) => translateExample(example.id, languages), onSuccess: replace });
  const countries = useMutation({ mutationFn: (codes: string[]) => updateExample(example.id, codes), onSuccess: replace });
  const remove = useMutation({
    mutationFn: () => (confirming === "example" || confirming === null ? removeExample(example.id) : removeExampleVersion(example.id, confirming)),
    onSuccess: refresh,
    onSettled: () => setConfirming(null),
  });

  const shown = displayVersion(example.versions, locale);
  const byLanguage = new Map(example.versions.map((v) => [v.language, v]));
  const canTranslate = example.versions.some((v) => v.state === "done");
  const missing = LANGUAGES.filter((l) => !byLanguage.has(l));
  const failure = translate.error ?? countries.error ?? remove.error;

  return (
    <Card data-testid={`example-${example.id}`} data-example-id={example.id}>
      <div className="flex flex-wrap items-start gap-4">
        {shown?.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
          <img src={shown.heroImageUrl} alt="" className="size-16 shrink-0 rounded-xl border border-border bg-white object-contain" />
        ) : (
          <div className="size-16 shrink-0 rounded-xl bg-border" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {shown ? (
            <Link href={`/admin/books/${shown.bookId}`} data-testid={`example-${example.id}-title`} className="font-bold hover:text-accent">
              {shown.title ?? t("admin.untitled")}
            </Link>
          ) : (
            <span className="font-bold">{t("admin.untitled")}</span>
          )}
          {shown && (
            <span className="text-sm text-muted">
              {shown.childName} · {shown.language.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton data-testid={`example-${example.id}-up`} label={t("admin.examples.up")} disabled={first || moving} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton data-testid={`example-${example.id}-down`} label={t("admin.examples.down")} disabled={last || moving} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton variant="danger" data-testid={`example-${example.id}-remove`} label={t("admin.examples.remove")} onClick={() => setConfirming("example")}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("admin.examples.versions")}</p>
        <ul data-testid={`example-${example.id}-languages`} className="flex flex-wrap items-center gap-2">
          {LANGUAGES.map((language) => (
            <LanguageChip
              key={language}
              exampleId={example.id}
              language={language}
              version={byLanguage.get(language)}
              canTranslate={canTranslate}
              busy={translate.isPending}
              onTranslate={() => translate.mutate([language])}
              onRemove={() => setConfirming(language)}
            />
          ))}
        </ul>
        {canTranslate && missing.length > 1 && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            data-testid={`example-${example.id}-translate-all`}
            loading={translate.isPending}
            icon={<Languages className="size-4" />}
            onClick={() => translate.mutate(missing)}
          >
            {t("admin.examples.translateAll")}
          </Button>
        )}
      </div>

      <ExampleCountries example={example} saving={countries.isPending ? countries.variables : undefined} onChange={(codes) => countries.mutate(codes)} />
      {failure && <ErrorText data-testid={`example-${example.id}-error`}>{errorText(failure)}</ErrorText>}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
        testId="example-confirm"
        confirmTestId="example-confirm-yes"
        title={
          confirming === "example" || confirming === null
            ? t("admin.examples.remove.title")
            : t("admin.examples.removeVersion.title", { language: LANGUAGE_NAMES[confirming] })
        }
        description={confirming === "example" || confirming === null ? t("admin.examples.remove.text") : t("admin.examples.removeVersion.text")}
        confirmLabel={t("admin.delete")}
        cancelLabel={t("admin.examples.cancel")}
        closeLabel={t("admin.close")}
      />
    </Card>
  );
}

/** A language of the example: its finished version (opens the book), its translation's progress or failure, or a way to translate. */
function LanguageChip({
  exampleId,
  language,
  version,
  canTranslate,
  busy,
  onTranslate,
  onRemove,
}: {
  exampleId: string;
  language: Language;
  version: AdminExampleVersion | undefined;
  canTranslate: boolean;
  busy: boolean;
  onTranslate: () => void;
  onRemove: () => void;
}) {
  const { t } = useAdminI18n();
  const state = version?.state ?? "missing";
  const name = LANGUAGE_NAMES[language];
  const testId = `example-${exampleId}-lang-${language}`;
  const tone = {
    done: "border-success/50 bg-success/10",
    translating: "border-warning/50 bg-warning/10",
    failed: "border-danger/50 bg-danger/10",
    missing: "border-dashed border-border",
  }[state];
  return (
    <li data-testid={testId} data-state={state} title={version?.error ?? name} className={cx("flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-3 text-sm", tone)}>
      {version && state === "done" ? (
        <Link href={`/admin/books/${version.bookId}`} className="font-bold hover:text-accent" title={version.title ?? name}>
          {language.toUpperCase()}
        </Link>
      ) : (
        <span className="font-bold">{language.toUpperCase()}</span>
      )}
      <span className="text-muted">
        {state === "translating" && version ? `${t("admin.examples.state.translating")} ${version.progress}%` : t(`admin.examples.state.${state}`)}
      </span>
      {state === "translating" && <Spinner size="sm" />}
      {version?.translated && state === "done" && <span className="text-xs text-muted">· {formatSpendUsd(version.costUsd)}</span>}
      {(state === "missing" || state === "failed") && canTranslate && (
        <Button
          variant="ghost"
          size="sm"
          data-testid={`example-${exampleId}-translate-${language}`}
          aria-label={t("admin.examples.translateTo", { language: name })}
          disabled={busy}
          icon={state === "failed" ? <RotateCw className="size-3.5" /> : <Languages className="size-3.5" />}
          onClick={onTranslate}
        >
          {state === "failed" ? t("admin.examples.retry") : t("admin.examples.translate")}
        </Button>
      )}
      {version && state !== "translating" && (
        <button
          type="button"
          data-testid={`example-${exampleId}-remove-${language}`}
          aria-label={t("admin.examples.removeVersion", { language: name })}
          title={t("admin.examples.removeVersion", { language: name })}
          onClick={onRemove}
          className="rounded-full p-1 text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

/** Where the example shows; an empty list follows its catalog book (shown as the inherited value), or everywhere. */
function ExampleCountries({ example, saving, onChange }: { example: AdminExample; saving: string[] | undefined; onChange: (codes: string[]) => void }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const inherited = showcaseCountries([], example.templateCountries);
  return (
    <CountriesField
      testId={`example-${example.id}-countries`}
      chipTestId={`example-${example.id}-country`}
      label={t("admin.examples.countries")}
      hint={t("admin.examples.countries.hint")}
      empty={
        <span
          data-testid={`example-${example.id}-countries-inherited`}
          data-value={inherited.join(" ")}
          className="flex flex-wrap items-center gap-2 text-sm text-muted"
        >
          {inherited.length === 0 ? (
            t("admin.examples.countries.all")
          ) : (
            <>
              {t("admin.examples.countries.inherited")}
              {inherited.map((code) => (
                <span key={code} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1">
                  <Flag code={code} />
                  {countryName(code)}
                </span>
              ))}
            </>
          )}
        </span>
      }
      value={saving ?? example.countries}
      onChange={onChange}
    />
  );
}
