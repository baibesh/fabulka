"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COUNTRY_POLICY_BLOCKED, CountryCodeSchema, type AdminReference, type BlockedCountries } from "@fabulka/shared";
import { ExternalLink, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCountryName } from "@/hooks/use-country-name";
import type { MessageKey } from "@/i18n/messages";
import { saveBlocked } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { Card, useAdminI18n } from "../ui";
import { errorText, QUERY, SaveBar } from "./shared";

/** Countries the site refuses: Meta's list (read-only) and the owner's own additions. */
export function BlockedTab({ initial }: { initial: BlockedCountries }) {
  const { t } = useAdminI18n();
  const countryName = useCountryName("admin");
  const queryClient = useQueryClient();
  const [extra, setExtra] = useState(initial.extra);
  const [code, setCode] = useState("");
  const [addError, setAddError] = useState<MessageKey | null>(null);
  const meta = new Set(initial.meta.map((c) => c.code));
  const save = useMutation({
    mutationFn: (next: string[]) => saveBlocked(next),
    onSuccess: (blocked) => {
      queryClient.setQueryData<AdminReference>(QUERY, (old) => (old ? { ...old, blocked } : old));
      setExtra(blocked.extra);
    },
  });
  const policyRefused = save.error instanceof ApiError && save.error.code === COUNTRY_POLICY_BLOCKED;

  const add = () => {
    const parsed = CountryCodeSchema.safeParse(code);
    if (!parsed.success) return setAddError("admin.reference.error.country");
    if (meta.has(parsed.data)) return setAddError("admin.reference.error.countryMeta");
    if (extra.includes(parsed.data)) return setAddError("admin.reference.error.countryDuplicate");
    setAddError(null);
    setExtra((list) => [...list, parsed.data]);
    setCode("");
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title={t("admin.reference.meta.title", { count: initial.meta.length })} border="dashed">
        <div data-testid="blocked-meta" className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t("admin.reference.meta.text")}</p>
          <a href={initial.policyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start text-sm font-semibold text-accent">
            {t("admin.reference.meta.policy")}
            <ExternalLink className="size-3.5" />
          </a>
          <ul className="flex flex-wrap gap-2">
            {initial.meta.map((country) => (
              <li key={country.code} data-testid="blocked-meta-row" data-code={country.code} className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-sm">
                <span className="font-mono text-xs font-bold text-muted">{country.code}</span>
                {countryName(country.code, country.name)}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(extra);
        }}
        className="flex flex-col gap-4"
      >
        <Card title={t("admin.reference.extra.title")}>
          <div data-testid="blocked-extra" className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t("admin.reference.extra.text")}</p>
            {extra.length === 0 ? (
              <p className="text-sm text-muted">{t("admin.reference.extra.empty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {extra.map((c) => (
                  <li key={c} data-testid="blocked-row" data-code={c} className="flex items-center gap-1.5 rounded-full bg-danger/10 py-1 pr-1 pl-3 text-sm">
                    <span className="font-mono text-xs font-bold">{c}</span>
                    {countryName(c)}
                    <button
                      type="button"
                      data-testid="blocked-remove"
                      aria-label={t("admin.reference.extra.remove", { country: countryName(c) })}
                      title={t("admin.reference.extra.remove", { country: countryName(c) })}
                      onClick={() => setExtra((list) => list.filter((x) => x !== c))}
                      className="rounded-full p-1 hover:bg-danger/20"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Input
                  data-testid="blocked-input"
                  value={code}
                  maxLength={2}
                  aria-label={t("admin.reference.extra.placeholder")}
                  placeholder={t("admin.reference.extra.placeholder")}
                  invalid={!!addError}
                  aria-describedby={addError ? "blocked-input-error" : undefined}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setAddError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                  }}
                  className="max-w-xs font-mono uppercase placeholder:font-sans placeholder:normal-case"
                />
                <Button variant="secondary" data-testid="blocked-add" onClick={add} icon={<Plus className="size-4" />}>
                  {t("admin.reference.extra.add")}
                </Button>
              </div>
              {addError && (
                <span id="blocked-input-error" data-testid="reference-error" className={errorText}>
                  {t(addError)}
                </span>
              )}
            </div>
          </div>
        </Card>
        <SaveBar
          pending={save.isPending}
          saved={save.isSuccess}
          error={policyRefused ? new Error(t("admin.reference.error.countryMeta")) : save.error}
          problems={false}
        />
      </form>
    </div>
  );
}
