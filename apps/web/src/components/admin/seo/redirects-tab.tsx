"use client";

import { REDIRECT_INVALID, REDIRECT_PROBLEMS, type Redirect, type RedirectInput, type RedirectProblem } from "@fabulka/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@/lib/query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { createRedirect, deleteRedirect, seoHistory, seoRedirects, updateRedirect } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { HistoryList } from "./shared";

const EMPTY: RedirectInput = { from: "", to: "", status: 301, active: true };

/** Why the API refused a redirect, in the admin's words. */
function useRedirectError() {
  const { t } = useAdminI18n();
  return (error: Error | null) => {
    if (!error) return null;
    const reason = error instanceof ApiError && error.code === REDIRECT_INVALID ? (error.body as { reason?: string })?.reason : undefined;
    return reason && (REDIRECT_PROBLEMS as readonly string[]).includes(reason) ? t(`admin.seo.redirect.error.${reason as RedirectProblem}`) : error.message;
  };
}

/** Redirects the site's proxy applies (301 or 302), checked against loops and the admin/API/files paths. */
export function RedirectsTab() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const errorText = useRedirectError();
  const redirects = useQuery({ queryKey: ["admin", "seo", "redirects"], queryFn: seoRedirects });
  const history = useQuery({ queryKey: ["admin", "seo", "history", "redirect"], queryFn: () => seoHistory({ kind: "redirect" }) });
  const [form, setForm] = useState<RedirectInput>(EMPTY);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "redirects"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "seo", "history", "redirect"] });
  };
  const create = useMutation({
    mutationFn: () => createRedirect(form),
    onSuccess: () => {
      setForm(EMPTY);
      refresh();
    },
  });
  const update = useMutation({ mutationFn: (r: Redirect) => updateRedirect(r.id, { from: r.from, to: r.to, status: r.status, active: !r.active }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => deleteRedirect(id), onSuccess: refresh });

  return (
    <>
      <Card title={t("admin.seo.redirect.add")}>
        <p className="text-sm text-muted">{t("admin.seo.redirect.hint")}</p>
        <form
          data-testid="redirect-form"
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label={t("admin.seo.field.from")}>
            <Input data-testid="redirect-from" code value={form.from} placeholder="/old-page" onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label={t("admin.seo.field.to")}>
            <Input data-testid="redirect-to" code value={form.to} placeholder="/catalog" onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Field label={t("admin.seo.field.status")}>
            <Select data-testid="redirect-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value === "302" ? 302 : 301 })}>
              <option value="301">301 - {t("admin.seo.redirect.permanent")}</option>
              <option value="302">302 - {t("admin.seo.redirect.temporary")}</option>
            </Select>
          </Field>
          <ChoiceLabel className="md:pb-2.5">
            <Checkbox data-testid="redirect-active" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {t("admin.seo.field.active")}
          </ChoiceLabel>
          <Button type="submit" data-testid="redirect-add" loading={create.isPending} disabled={!form.from.trim() || !form.to.trim()} icon={<Plus className="size-4" />}>
            {t("admin.seo.redirect.addButton")}
          </Button>
        </form>
        {create.isError && <ErrorText data-testid="redirect-error">{errorText(create.error)}</ErrorText>}
      </Card>
      {(update.isError || remove.isError) && <ErrorText data-testid="redirect-row-error">{errorText(update.error ?? remove.error)}</ErrorText>}
      {!redirects.data ? (
        <QueryState error={redirects.error} scope="admin" />
      ) : (
        <TableFrame>
          <Table data-testid="redirects-table">
            <thead>
              <tr>
                <th>{t("admin.seo.field.from")}</th>
                <th>{t("admin.seo.field.to")}</th>
                <th>{t("admin.seo.field.status")}</th>
                <th>{t("admin.seo.field.active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {redirects.data.length === 0 && <TableEmpty colSpan={5}>{t("admin.seo.redirect.empty")}</TableEmpty>}
              {redirects.data.map((r) => (
                <tr key={r.id} data-testid={`redirect-row-${r.from}`}>
                  <td className="font-mono text-xs">{r.from}</td>
                  <td className="font-mono text-xs break-all">{r.to}</td>
                  <td>{r.status}</td>
                  <td>
                    <Checkbox data-testid="redirect-toggle" aria-label={t("admin.seo.field.active")} checked={r.active} onChange={() => update.mutate(r)} />
                  </td>
                  <td className="text-right">
                    <IconButton label={t("admin.seo.redirect.delete")} data-testid="redirect-delete" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
      <Card title={t("admin.seo.history.recent")}>{history.data ? <HistoryList entries={history.data.slice(0, 20)} /> : <QueryState error={history.error} scope="admin" />}</Card>
    </>
  );
}
