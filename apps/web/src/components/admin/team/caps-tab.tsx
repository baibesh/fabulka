"use client";

import type { StaffCapDefaults } from "@fabulka/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { saveStaffCapDefaults, staffCapDefaults } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { MEMBERS_QUERY } from "./shared";

export const CAPS_QUERY = ["admin", "team", "caps"] as const;

/** A dollar amount typed in a field: empty is no cap. */
export const usdOrNull = (text: string): number | null => (text.trim() === "" ? null : Number(text.replace(",", ".")));
const valid = (text: string) => text.trim() === "" || (Number.isFinite(Number(text.replace(",", "."))) && Number(text.replace(",", ".")) >= 0);

/**
 * The default daily caps on staff generation (example translations, theme proposals), in dollars:
 * each person's and each country's. Empty is no cap. Superadmins are uncapped unless given a cap of
 * their own on the People tab, where anyone's own cap is set too.
 */
export function CapsTab() {
  const caps = useQuery({ queryKey: CAPS_QUERY, queryFn: staffCapDefaults });
  if (!caps.data) return <QueryState error={caps.error} scope="admin" />;
  return <CapsForm key={JSON.stringify(caps.data)} initial={caps.data} />;
}

function CapsForm({ initial }: { initial: StaffCapDefaults }) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [person, setPerson] = useState(initial.personUsd?.toString() ?? "");
  const [country, setCountry] = useState(initial.countryUsd?.toString() ?? "");
  const save = useMutation({
    mutationFn: () => saveStaffCapDefaults({ personUsd: usdOrNull(person), countryUsd: usdOrNull(country) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(CAPS_QUERY, saved);
      void queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "budget"] });
    },
  });
  return (
    <Card title={t("admin.caps.title")}>
      <p className="text-sm text-muted">{t("admin.caps.lead")}</p>
      <form
        data-testid="caps-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("admin.caps.person")} hint={t("admin.caps.emptyHint")}>
            <Input data-testid="caps-person" inputMode="decimal" value={person} invalid={!valid(person)} onChange={(e) => setPerson(e.target.value)} />
          </Field>
          <Field label={t("admin.caps.country")} hint={t("admin.caps.emptyHint")}>
            <Input data-testid="caps-country" inputMode="decimal" value={country} invalid={!valid(country)} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" data-testid="caps-save" loading={save.isPending} disabled={!valid(person) || !valid(country)} icon={<Save className="size-4" />}>
            {t("admin.team.save")}
          </Button>
          {save.isSuccess && (
            <span data-testid="caps-saved" className="text-sm text-success">
              {t("admin.caps.saved")}
            </span>
          )}
        </div>
        {save.isError && <ErrorText>{save.error.message}</ErrorText>}
      </form>
    </Card>
  );
}
