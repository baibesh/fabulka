"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CONSENT_LANGUAGES, ConsentClausesSchema, LANGUAGE_NAMES, type AdminConsentVersion, type ConsentClause, type Language } from "@fabulka/shared";
import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { QueryState } from "@/components/ui/query-state";
import { Tabs, tabPanelProps, useTabsId } from "@/components/ui/tabs";
import { adminConsent, saveConsent } from "@/lib/admin-api";
import { useQuery } from "@/lib/query";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows } from "./reference/shared";
import { Card, PageTitle, useAdminI18n } from "./ui";

const QUERY = ["admin", "consent"];

/** A clause in the form, with a key that stays put while rows move. */
type ClauseDraft = ConsentClause & { key: number };
const withKey = (clause: ConsentClause): ClauseDraft => ({ ...clause, key: nextKey() });
/** A fresh clause id the schema accepts. */
const newId = () => `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * Admin «Consent» (Global settings): what a parent reads and ticks before the child's photo is sent
 * to Meta, per language. Clauses are added, removed and reordered; each is a required checkbox or an
 * information line, the first is the lead line shown large. Saving makes a new version; books keep
 * the version their parent accepted. Every save is in Activity.
 */
export function ConsentEditor() {
  const { t } = useAdminI18n();
  const consent = useQuery({ queryKey: QUERY, queryFn: adminConsent });
  const [language, setLanguage] = useState<Language>("en");
  const base = useTabsId();
  const entry = consent.data?.languages.find((l) => l.language === language);
  return (
    <div data-testid="admin-consent" className="flex flex-col gap-4">
      <PageTitle>{t("admin.nav.consent")}</PageTitle>
      <p className="max-w-3xl text-sm text-muted">{t("admin.consent.hint")}</p>
      <Tabs
        base={base}
        data-testid="consent-languages"
        label={t("admin.consent.languages")}
        value={language}
        onChange={setLanguage}
        items={CONSENT_LANGUAGES.map((l) => ({ id: l, label: LANGUAGE_NAMES[l], testId: `consent-lang-${l}` }))}
      />
      <QueryState error={consent.error} scope="admin" />
      {entry && (
        <div {...tabPanelProps(base, language)} className="flex flex-col gap-4">
          <ClausesForm key={`${language}-${entry.current.version}`} language={language} current={entry.current} />
          <History versions={entry.history} />
        </div>
      )}
    </div>
  );
}

function ClausesForm({ language, current }: { language: Language; current: AdminConsentVersion }) {
  const { t, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => current.clauses.map(withKey));
  const save = useMutation({
    mutationFn: async (next: ClauseDraft[]) => {
      const parsed = ConsentClausesSchema.safeParse(
        next.map(({ id, kind, text, link }) => ({ id, kind, text, ...(link?.url.trim() && { link }) })),
      );
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveConsent(language, parsed.data) : null;
    },
    onSuccess: (saved) => {
      if (saved) void queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });
  return (
    <form
      data-testid="consent-form"
      data-language={language}
      data-version={current.version}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          <span data-testid="consent-current-version" className="font-semibold">
            {t("admin.consent.version", { version: current.version })}
          </span>
          <span className="text-muted">{t("admin.consent.since", { date: date(current.createdAt), who: current.createdBy ?? "Fabulka" })}</span>
        </p>
        {problems[""] && <p className={errorText}>{t("admin.consent.error.checkbox")}</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((clause, i) => (
            <li key={clause.key} data-testid="consent-clause-row" data-kind={clause.kind} className="flex flex-col gap-3 rounded-xl bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-muted">{i + 1}</span>
                  {i === 0 && <Badge tone="accent">{t("admin.consent.lead")}</Badge>}
                  <Select
                    small
                    data-testid="consent-clause-kind"
                    aria-label={t("admin.consent.kind")}
                    value={clause.kind}
                    onChange={(e) => update(i, () => ({ kind: e.target.value as ConsentClause["kind"] }))}
                    className="w-auto"
                  >
                    <option value="info">{t("admin.consent.kind.info")}</option>
                    <option value="checkbox">{t("admin.consent.kind.checkbox")}</option>
                  </Select>
                </div>
                <RowActions
                  prefix="consent-clause"
                  index={i}
                  count={rows.length}
                  labels={{ up: t("admin.consent.up"), down: t("admin.consent.down"), remove: t("admin.consent.remove") }}
                  onMove={(by) => move(i, by)}
                  onRemove={() => remove(i)}
                />
              </div>
              <Textarea
                data-testid="consent-clause-text"
                aria-label={t("admin.consent.text")}
                rows={i === 0 ? 3 : 2}
                maxLength={600}
                value={clause.text}
                invalid={Boolean(problems[`${i}.text`])}
                onChange={(e) => update(i, () => ({ text: e.target.value }))}
              />
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <Input
                  small
                  data-testid="consent-clause-link-url"
                  aria-label={t("admin.consent.linkUrl")}
                  placeholder={t("admin.consent.linkUrl")}
                  value={clause.link?.url ?? ""}
                  invalid={Boolean(problems[`${i}.link.url`])}
                  onChange={(e) => update(i, (row) => ({ link: { url: e.target.value, label: row.link?.label ?? "" } }))}
                />
                <Input
                  small
                  data-testid="consent-clause-link-label"
                  aria-label={t("admin.consent.linkLabel")}
                  placeholder={t("admin.consent.linkLabel")}
                  value={clause.link?.label ?? ""}
                  invalid={Boolean(problems[`${i}.link.label`])}
                  onChange={(e) => update(i, (row) => ({ link: { url: row.link?.url ?? "", label: e.target.value } }))}
                />
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="secondary"
          data-testid="consent-clause-add"
          icon={<Plus className="size-4" />}
          disabled={rows.length >= 12}
          onClick={() => setRows((list) => [...list, withKey({ id: newId(), kind: "info", text: "" })])}
          className="self-start"
        >
          {t("admin.consent.add")}
        </Button>
      </Card>
      <SaveBar testId="consent-save" pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

/** Every version of this language, newest first: when and by whom. */
function History({ versions }: { versions: AdminConsentVersion[] }) {
  const { t, date } = useAdminI18n();
  if (!versions.length) return null;
  return (
    <Card>
      <h2 className="font-bold">{t("admin.consent.history")}</h2>
      <ol data-testid="consent-history" className="flex flex-col gap-1 text-sm">
        {versions.map((v) => (
          <li key={v.version} data-testid="consent-history-row" data-version={v.version} className="flex flex-wrap gap-x-3">
            <span className="font-semibold">{t("admin.consent.version", { version: v.version })}</span>
            <span className="text-muted">{date(v.createdAt)}</span>
            <span className="text-muted">{v.createdBy ?? "Fabulka"}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
