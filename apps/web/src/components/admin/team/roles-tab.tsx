"use client";

import { ADMIN_PERMISSIONS, type AdminRight, type StaffRole } from "@fabulka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorText } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { createStaffRole, deleteStaffRole, staffRoles, updateStaffRole } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { hasBuiltinName, MEMBERS_QUERY, RightsPicker, ROLES_QUERY, useRoleName, useTeamError } from "./shared";

/**
 * The roles in the database: each one's sections as checkboxes and whether it is country-scoped.
 * The superadmin role is shown, never edited; a role is deleted only when nobody holds it.
 */
export function RolesTab() {
  const { t } = useAdminI18n();
  const roles = useQuery({ queryKey: ROLES_QUERY, queryFn: staffRoles });
  return (
    <>
      <p className="text-sm text-muted">{t("admin.team.roles.lead")}</p>
      {!roles.data ? (
        <QueryState error={roles.error} scope="admin" />
      ) : (
        <>
          {roles.data.map((role) => (
            <RoleCard key={`${role.key}:${role.rights.join(",")}:${role.scoped}:${role.name}`} role={role} roles={roles.data} />
          ))}
          <NewRole />
        </>
      )}
    </>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ROLES_QUERY });
    void queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY });
    void queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
  };
}

function RoleCard({ role, roles }: { role: StaffRole; roles: readonly StaffRole[] }) {
  const { t } = useAdminI18n();
  const roleName = useRoleName();
  const teamError = useTeamError();
  const refresh = useRefresh();
  const [name, setName] = useState(role.name);
  const [rights, setRights] = useState<AdminRight[]>(role.rights);
  const [scoped, setScoped] = useState(role.scoped);
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({ mutationFn: () => updateStaffRole(role.key, { name, rights, scoped }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteStaffRole(role.key), onSuccess: refresh });
  const changed = name !== role.name || scoped !== role.scoped || rights.join() !== role.rights.join();
  // The superadmin role is shown with every section, team included.
  const shown: AdminRight[] = role.locked ? [...ADMIN_PERMISSIONS] : rights;

  return (
    <Card
      data-testid={`role-card-${role.key}`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {roleName(role.key, roles)}
          <code className="text-xs font-normal text-muted">{role.key}</code>
          {role.scoped && <Badge tone="accent">{t("admin.team.roles.scoped")}</Badge>}
          {role.locked && <Lock className="size-4 text-muted" aria-label={t("admin.team.roles.locked")} />}
        </span>
      }
      action={<span className="text-sm text-muted" data-testid="role-members">{t("admin.team.roles.members", { n: role.members })}</span>}
    >
      {role.locked ? (
        <p className="text-sm text-muted">{t("admin.team.roles.locked")}</p>
      ) : (
        // A built-in role's name is in the admin's messages, in every language.
        !hasBuiltinName(role.key) && (
          <Field label={t("admin.team.roles.name")} className="max-w-sm">
            <Input data-testid="role-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">{t("admin.team.roles.sections")}</legend>
        <RightsPicker value={shown} onChange={setRights} testId="role-right" disabled={role.locked} />
      </fieldset>
      {!role.locked && (
        <>
          <ChoiceLabel>
            <Checkbox data-testid="role-scoped" checked={scoped} onChange={(e) => setScoped(e.target.checked)} />
            <span>
              <span className="font-semibold">{t("admin.team.roles.scoped")}</span> — <span className="text-muted">{t("admin.team.roles.scopedHint")}</span>
            </span>
          </ChoiceLabel>
          <div className="flex flex-wrap gap-2">
            <Button data-testid="role-save" loading={save.isPending} disabled={!changed || !name.trim() || rights.length === 0} icon={<Save className="size-4" />} onClick={() => save.mutate()}>
              {t("admin.team.save")}
            </Button>
            {!role.builtin && (
              <Button variant="danger-outline" data-testid="role-delete" disabled={role.members > 0} icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
                {t("admin.team.roles.delete")}
              </Button>
            )}
          </div>
          {(save.isError || remove.isError) && <ErrorText data-testid="role-error">{teamError(save.error ?? remove.error)}</ErrorText>}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate(undefined, { onSettled: () => setConfirm(false) })}
        title={t("admin.team.roles.deleteConfirm", { name: roleName(role.key, roles) })}
        confirmLabel={t("admin.team.roles.delete")}
        cancelLabel={t("admin.team.cancel")}
        closeLabel={t("admin.team.close")}
        pending={remove.isPending}
        testId="role-delete-dialog"
        confirmTestId="role-delete-confirm"
      />
    </Card>
  );
}

function NewRole() {
  const { t } = useAdminI18n();
  const teamError = useTeamError();
  const refresh = useRefresh();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [rights, setRights] = useState<AdminRight[]>([]);
  const [scoped, setScoped] = useState(false);
  const create = useMutation({
    mutationFn: () => createStaffRole({ key: key.trim(), name, rights, scoped }),
    onSuccess: () => {
      setKey("");
      setName("");
      setRights([]);
      setScoped(false);
      refresh();
    },
  });
  return (
    <Card title={t("admin.team.roles.new")} data-testid="role-new">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("admin.team.roles.key")} hint={t("admin.team.roles.keyHint")}>
            <Input data-testid="role-new-key" code value={key} placeholder="orders_desk" autoComplete="off" onChange={(e) => setKey(e.target.value.toLowerCase())} />
          </Field>
          <Field label={t("admin.team.roles.name")}>
            <Input data-testid="role-new-name" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold">{t("admin.team.roles.sections")}</legend>
          <RightsPicker value={rights} onChange={setRights} testId="role-new-right" />
        </fieldset>
        <ChoiceLabel>
          <Checkbox data-testid="role-new-scoped" checked={scoped} onChange={(e) => setScoped(e.target.checked)} />
          <span>
            <span className="font-semibold">{t("admin.team.roles.scoped")}</span> — <span className="text-muted">{t("admin.team.roles.scopedHint")}</span>
          </span>
        </ChoiceLabel>
        <div>
          <Button
            type="submit"
            data-testid="role-create"
            loading={create.isPending}
            disabled={!/^[a-z][a-z0-9_]{1,39}$/.test(key.trim()) || !name.trim() || rights.length === 0}
            icon={<Plus className="size-4" />}
          >
            {t("admin.team.roles.create")}
          </Button>
        </div>
        {create.isError && <ErrorText data-testid="role-new-error">{teamError(create.error)}</ErrorText>}
      </form>
    </Card>
  );
}
