"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  SCOPE_FORBIDDEN,
  allowedFor,
  displayVersion,
  ruleShows,
  isExampleError,
  showcaseRule,
  type AdminExample,
  type AdminExampleVersion,
  type CountriesMode,
  type Language,
} from "@fabulka/shared";
import { ArrowDown, ArrowUp, Grid3x3, Languages, Lock, Plus, RotateCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  adminExamples,
  createExample,
  exampleCandidates,
  removeExample,
  removeExampleVersion,
  reorderExamples,
  translateExample,
  updateExample,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { useCountryName } from "@/hooks/use-country-name";
import { Flag } from "@/components/ui/flag";
import { Button, IconButton, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Spinner } from "@/components/ui/spinner";
import { cx } from "@/components/ui/cx";
import { CountriesField } from "./countries-field";
import { Card, formatSpendUsd, PageTitle, useAdminI18n } from "./ui";
import { StaffBudgetNote, useCapError, useRefreshBudget } from "./staff-budget";
import { useWorkingCountry } from "./working-country";

/** The admin's examples list (also read by a book's page, which offers to add the book to one). */
export const EXAMPLES_QUERY = ["admin", "examples"] as const;

/** An API refusal in the admin's words (admin.examples.error.<code>), else its message. */
export function useExampleError() {
  const { t } = useAdminI18n();
  const capError = useCapError();
  return (error: Error | null) => {
    if (!error) return null;
    const cap = capError(error);
    if (cap) return cap;
    if (error instanceof ApiError && isExampleError(error.code)) return t(`admin.examples.error.${error.code}`);
    if (error instanceof ApiError && error.code === SCOPE_FORBIDDEN) return t("admin.scope.forbidden");
    return error.message;
  };
}

/** Where an example shows: its own rule, else its catalog book's (the same rule as the site's). */
export function exampleRule(example: AdminExample) {
  return showcaseRule(
    { mode: example.countriesMode, countries: example.countries },
    example.templateCountries ? { mode: example.templateCountriesMode, countries: example.templateCountries } : null,
  );
}

/**
 * «Examples»: the stories on the home page, in its order, those shown in the working country. Each
 * shows its version in the admin's language (else the first finished one), a chip per language —
 * finished, being translated, failed or missing, with «Translate» for the missing ones —, the
 * countries it shows in, and ways to move or remove it. An example shown outside the session's
 * countries is read-only for a country manager. While a translation runs the list refreshes itself.
 */
export function ExamplesPage() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useExampleError();
  const { country } = useWorkingCountry();
  const examples = useQuery({
    queryKey: EXAMPLES_QUERY,
    queryFn: adminExamples,
    refetchInterval: (query) => (query.state.data?.some((e) => e.versions.some((v) => v.state === "translating")) ? 2000 : false),
  });
  const reorder = useMutation({
    mutationFn: reorderExamples,
    onSuccess: (list) => queryClient.setQueryData(EXAMPLES_QUERY, list),
  });

  const all = examples.data;
  const list = all && country ? all.filter((e) => ruleShows(exampleRule(e), country)) : all;
  // Moves happen among the examples the session may change (all of them for global staff): the API
  // keeps everyone else's where they are.
  const movable = all?.filter((e) => e.editable).map((e) => e.id) ?? [];
  const move = (id: string, by: -1 | 1) => {
    const ids = [...movable];
    const index = ids.indexOf(id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <>
      <PageTitle
        aside={
          <Link href="/admin/examples/matrix" data-testid="examples-matrix-link" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <Grid3x3 className="size-4" />
            {t("admin.matrix.title")}
          </Link>
        }
      >
        {t("admin.examples.title")}
      </PageTitle>
      <p className="max-w-3xl text-sm text-muted">{t("admin.examples.lead")}</p>
      {/* Translations call paid models: the person's (and the working country's) budget today. */}
      <StaffBudgetNote country={country} />
      <NewExample />
      {!list && <QueryState error={examples.error} scope="admin" />}
      {reorder.isError && <ErrorText>{errorText(reorder.error)}</ErrorText>}
      {list?.length === 0 && (
        <p data-testid="examples-empty" className="text-muted">
          {t("admin.examples.empty")}
        </p>
      )}
      <ol data-testid="examples-list" className="flex flex-col gap-4">
        {list?.map((example) => (
          <li key={example.id}>
            <ExampleCard
              example={example}
              first={movable[0] === example.id}
              last={movable.at(-1) === example.id}
              moving={reorder.isPending}
              onMove={(by) => move(example.id, by)}
            />
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * A new example from a finished book made in the working country (any country of the session's
 * without one), shown in that country; global staff with "All countries" make one shown everywhere.
 */
function NewExample() {
  const { t, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useExampleError();
  const countryName = useCountryName("admin");
  const { country } = useWorkingCountry();
  const [bookId, setBookId] = useState("");
  const candidates = useQuery({ queryKey: ["admin", "example-candidates", country], queryFn: () => exampleCandidates(country) });
  const create = useMutation({
    mutationFn: () => createExample(bookId, country ? [country] : undefined),
    onSuccess: () => {
      setBookId("");
      void queryClient.invalidateQueries({ queryKey: EXAMPLES_QUERY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "example-candidates"] });
    },
  });
  const options = candidates.data ?? [];
  return (
    <Card data-testid="example-new" data-loaded={candidates.data ? "true" : "false"} title={t("admin.examples.new")}>
      <p className="-mt-2 text-sm text-muted">{country ? t("admin.examples.new.hint", { country: countryName(country) }) : t("admin.examples.new.hintAll")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          data-testid="example-new-book"
          aria-label={t("admin.examples.new.book")}
          className="min-w-64 flex-1"
          value={bookId}
          disabled={!options.length}
          onChange={(e) => setBookId(e.target.value)}
        >
          <option value="">{options.length ? t("admin.examples.new.pick") : t("admin.examples.new.none")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {t("admin.template.samples.option", { title: o.title ?? o.id, name: o.childName, date: date(o.createdAt) })} · {o.language.toUpperCase()}
            </option>
          ))}
        </Select>
        <Button data-testid="example-new-create" disabled={!bookId} loading={create.isPending} icon={<Plus className="size-4" />} onClick={() => create.mutate()}>
          {t("admin.examples.new.create")}
        </Button>
      </div>
      {create.isError && <ErrorText data-testid="example-new-error">{errorText(create.error)}</ErrorText>}
    </Card>
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

  const { country: working } = useWorkingCountry();
  const refreshBudget = useRefreshBudget();
  const translate = useMutation({
    mutationFn: (languages: Language[]) => translateExample(example.id, languages, working),
    onSuccess: replace,
    onSettled: refreshBudget,
  });
  const countries = useMutation({
    mutationFn: ({ codes, mode }: { codes: string[]; mode: CountriesMode }) => updateExample(example.id, codes, mode),
    onSuccess: replace,
  });
  const locked = !example.editable;
  // A book's own admin page is the Books section's (a country manager has none).
  const books = useWorkingCountry().me.permissions.includes("books");
  const remove = useMutation({
    mutationFn: () => (confirming === "example" || confirming === null ? removeExample(example.id) : removeExampleVersion(example.id, confirming)),
    onSuccess: refresh,
    onSettled: () => setConfirming(null),
  });

  const shown = displayVersion(example.versions, locale);
  const byLanguage = new Map(example.versions.map((v) => [v.language, v]));
  const canTranslate = !locked && example.versions.some((v) => v.state === "done");
  const missing = LANGUAGES.filter((l) => !byLanguage.has(l));
  const failure = translate.error ?? countries.error ?? remove.error;

  return (
    <Card data-testid={`example-${example.id}`} data-example-id={example.id} data-editable={locked ? "false" : "true"}>
      <div className="flex flex-wrap items-start gap-4">
        {shown?.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated files, served by the API
          <img src={shown.heroImageUrl} alt="" className="size-16 shrink-0 rounded-xl border border-border bg-white object-contain" />
        ) : (
          <div className="size-16 shrink-0 rounded-xl bg-border" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {shown && books ? (
            <Link href={`/admin/books/${shown.bookId}`} data-testid={`example-${example.id}-title`} className="font-bold hover:text-accent">
              {shown.title ?? t("admin.untitled")}
            </Link>
          ) : shown ? (
            <span data-testid={`example-${example.id}-title`} className="font-bold">
              {shown.title ?? t("admin.untitled")}
            </span>
          ) : (
            <span className="font-bold">{t("admin.untitled")}</span>
          )}
          {shown && (
            <span className="text-sm text-muted">
              {shown.childName} · {shown.language.toUpperCase()}
            </span>
          )}
          {locked && (
            <span data-testid={`example-${example.id}-readonly`} className="flex items-center gap-1 text-xs text-muted">
              <Lock className="size-3.5" />
              {t("admin.examples.readonly")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton data-testid={`example-${example.id}-up`} label={t("admin.examples.up")} disabled={locked || first || moving} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton data-testid={`example-${example.id}-down`} label={t("admin.examples.down")} disabled={locked || last || moving} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton
            variant="danger"
            data-testid={`example-${example.id}-remove`}
            label={t("admin.examples.remove")}
            disabled={locked}
            onClick={() => setConfirming("example")}
          >
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
              locked={locked}
              linked={books}
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

      <ExampleCountries
        example={example}
        saving={countries.isPending ? countries.variables : undefined}
        onChange={(codes, mode) => countries.mutate({ codes, mode })}
      />
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
  locked,
  linked,
  busy,
  onTranslate,
  onRemove,
}: {
  exampleId: string;
  language: Language;
  version: AdminExampleVersion | undefined;
  canTranslate: boolean;
  locked: boolean;
  /** The version's book opens its admin page (the Books section). */
  linked: boolean;
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
      {version && state === "done" && linked ? (
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
      {version && state !== "translating" && !locked && (
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

/**
 * Where the example shows: only in its countries, or (global staff) everywhere except them; an empty
 * list follows its catalog book (shown as the inherited value), or everywhere. A country manager
 * picks among their own countries only.
 */
function ExampleCountries({
  example,
  saving,
  onChange,
}: {
  example: AdminExample;
  saving: { codes: string[]; mode: CountriesMode } | undefined;
  onChange: (codes: string[], mode: CountriesMode) => void;
}) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const { access, options } = useWorkingCountry();
  const global = allowedFor(access, "examples", null);
  const inherited = example.templateCountries ? { mode: example.templateCountriesMode, countries: example.templateCountries } : null;
  const value = saving?.codes ?? example.countries;
  const mode = saving?.mode ?? example.countriesMode;
  return (
    <CountriesField
      testId={`example-${example.id}-countries`}
      chipTestId={`example-${example.id}-country`}
      label={t("admin.examples.countries")}
      hint={t("admin.examples.countries.hint")}
      disabled={!example.editable}
      allowed={global ? undefined : options}
      mode={mode}
      onModeChange={global ? (next) => onChange(value, next) : undefined}
      empty={
        <span
          data-testid={`example-${example.id}-countries-inherited`}
          data-value={inherited?.countries.join(" ") ?? ""}
          className="flex flex-wrap items-center gap-2 text-sm text-muted"
        >
          {!inherited || inherited.countries.length === 0 ? (
            t("admin.examples.countries.all")
          ) : (
            <>
              {t(inherited.mode === "exclude" ? "admin.examples.countries.inheritedExcept" : "admin.examples.countries.inherited")}
              {inherited.countries.map((code) => (
                <span key={code} className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1">
                  <Flag code={code} />
                  {countryName(code)}
                </span>
              ))}
            </>
          )}
        </span>
      }
      value={value}
      onChange={(codes) => onChange(codes, mode)}
    />
  );
}
