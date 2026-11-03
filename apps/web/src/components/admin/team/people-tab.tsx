"use client";

import { SUPER_ROLE, type InviteResult, type StaffMember, type StaffRole } from "@fabulka/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Pencil, Send, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Flag } from "@/components/ui/flag";
import { Input } from "@/components/ui/input";
import { ErrorText, Notice } from "@/components/ui/notice";
import { QueryState } from "@/components/ui/query-state";
import { Table, TableEmpty, TableFrame } from "@/components/ui/table";
import { useCountryName } from "@/hooks/use-country-name";
import { inviteStaff, resendInvite, setStaffCap, setStaffEnabled, staffRoles, teamMembers, updateStaff } from "@/lib/admin-api";
import { CountriesField } from "../countries-field";
import { Card, formatSpendUsd, useAdminI18n } from "../ui";
import { usdOrNull } from "./caps-tab";
import { MEMBERS_QUERY, ROLES_QUERY, useRoleName, useTeamError } from "./shared";

const STATUS_TONE: Record<StaffMember["status"], BadgeTone> = { invited: "warning", active: "success", disabled: "neutral" };

interface Draft {
  email: string;
  name: string;
  roles: string[];
  countries: string[];
}

const EMPTY: Draft = { email: "", name: "", roles: [], countries: [] };

/** Some picked role holds only in the person's countries, so they need at least one. */
const needsCountries = (picked: readonly string[], roles: readonly StaffRole[]) => roles.some((r) => r.scoped && picked.includes(r.key));

/** The Team list: invite, edit roles and countries, disable or enable, resend the invitation. */
export function PeopleTab({ me }: { me: string | null }) {
  const { t, date } = useAdminI18n();
  const queryClient = useQueryClient();
  const teamError = useTeamError();
  const roleName = useRoleName();
  const countryName = useCountryName("admin");
  const members = useQuery({ queryKey: MEMBERS_QUERY, queryFn: teamMembers });
  const roles = useQuery({ queryKey: ROLES_QUERY, queryFn: staffRoles });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [disabling, setDisabling] = useState<StaffMember | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY });
    void queryClient.invalidateQueries({ queryKey: ROLES_QUERY });
  };

  const invite = useMutation({
    mutationFn: () => inviteStaff({ ...draft, countries: needsCountries(draft.roles, roles.data ?? []) ? draft.countries : [] }),
    onSuccess: (done) => {
      setResult(done);
      setDraft(EMPTY);
      refresh();
    },
  });
  const resend = useMutation({ mutationFn: (id: string) => resendInvite(id), onSuccess: setResult });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setStaffEnabled(id, enabled),
    onSuccess: () => {
      setDisabling(null);
      refresh();
    },
  });

  const allRoles = roles.data ?? [];
  const scoped = needsCountries(draft.roles, allRoles);
  const missingCountries = scoped && draft.countries.length === 0;
  const rowError = resend.error ?? toggle.error;

  return (
    <>
      <Card title={t("admin.team.invite.title")}>
        <p className="text-sm text-muted">{t("admin.team.invite.hint")}</p>
        <form
          data-testid="team-invite-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setResult(null);
            invite.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("admin.team.field.email")}>
              <Input
                type="email"
                data-testid="team-invite-email"
                value={draft.email}
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label={t("admin.team.field.name")}>
              <Input data-testid="team-invite-name" value={draft.name} autoComplete="off" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
          </div>
          <RolesChoice roles={allRoles} value={draft.roles} onChange={(next) => setDraft({ ...draft, roles: next })} testId="team-invite-role" />
          {scoped && (
            <CountriesField
              testId="team-invite-countries"
              chipTestId="team-invite-country"
              label={t("admin.team.field.countries")}
              hint={t("admin.team.countries.hint")}
              empty={<span className="text-sm text-danger">{t("admin.team.countries.required")}</span>}
              value={draft.countries}
              onChange={(next) => setDraft({ ...draft, countries: next })}
            />
          )}
          <div>
            <Button
              type="submit"
              data-testid="team-invite-submit"
              loading={invite.isPending}
              disabled={!draft.email.trim() || draft.roles.length === 0 || missingCountries}
              icon={<MailPlus className="size-4" />}
            >
              {t("admin.team.invite.submit")}
            </Button>
          </div>
        </form>
        {invite.isError && <ErrorText data-testid="team-error">{teamError(invite.error)}</ErrorText>}
        {result && (
          <Notice data-testid="team-invite-result" data-status={result.email} tone={result.email === "sent" || result.email === "not_needed" ? "success" : "warning"}>
            {t(`admin.team.invite.${result.email}`, { email: result.member.email })}
          </Notice>
        )}
      </Card>

      {rowError && <ErrorText data-testid="team-row-error">{teamError(rowError)}</ErrorText>}
      {!members.data ? (
        <QueryState error={members.error} scope="admin" />
      ) : (
        <TableFrame>
          <Table data-testid="team-table">
            <thead>
              <tr>
                <th>{t("admin.team.field.email")}</th>
                <th>{t("admin.team.field.roles")}</th>
                <th>{t("admin.team.field.countries")}</th>
                <th>{t("admin.team.field.status")}</th>
                <th>{t("admin.team.field.today")}</th>
                <th>{t("admin.team.field.lastLogin")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.data.length === 0 && <TableEmpty colSpan={7}>{t("admin.team.empty")}</TableEmpty>}
              {members.data.map((m) => {
                const realmAdmin = m.realmRoles.includes(SUPER_ROLE);
                return (
                  <tr key={m.id} data-testid={`team-row-${m.email}`} data-status={m.status}>
                    <td>
                      <p className="font-semibold">
                        {m.email}
                        {me === m.email && <span className="font-normal text-muted"> ({t("admin.team.you")})</span>}
                      </p>
                      {m.name && <p className="text-xs text-muted">{m.name}</p>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {m.roles.map((key) => (
                          <Badge key={key} tone={key === SUPER_ROLE ? "accent" : "neutral"} data-testid={`team-role-${key}`}>
                            {roleName(key, allRoles)}
                          </Badge>
                        ))}
                        {realmAdmin && (
                          <Badge tone="solid" title={t("admin.team.keycloakAdmin.hint")} data-testid="team-keycloak-admin">
                            {t("admin.team.keycloakAdmin")}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5" data-testid="team-countries" data-value={m.countries.join(" ")}>
                        {m.countries.length === 0 && <span className="text-muted">—</span>}
                        {m.countries.map((code) => (
                          <span key={code} className="flex items-center gap-1 text-sm" title={countryName(code)}>
                            <Flag code={code} />
                            {code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[m.status]} data-testid="team-status">
                        {t(`admin.team.status.${m.status}`)}
                      </Badge>
                    </td>
                    <td className="text-sm whitespace-nowrap" data-testid="team-spend" data-usd={m.spentTodayUsd} data-cap={m.effectiveCapUsd ?? "none"}>
                      <span className="tabular-nums">{formatSpendUsd(m.spentTodayUsd)}</span>
                      <span className="block text-xs text-muted">
                        {m.effectiveCapUsd === null ? t("admin.team.cap.none") : t("admin.team.cap.of", { cap: formatSpendUsd(m.effectiveCapUsd) })}
                      </span>
                    </td>
                    <td className="text-sm whitespace-nowrap text-muted">{m.lastLoginAt ? date(m.lastLoginAt) : t("admin.team.never")}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" data-testid="team-edit" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(m)}>
                          {t("admin.team.edit")}
                        </Button>
                        {m.status !== "disabled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="team-resend"
                            loading={resend.isPending && resend.variables === m.id}
                            icon={<Send className="size-3.5" />}
                            onClick={() => {
                              setResult(null);
                              resend.mutate(m.id);
                            }}
                          >
                            {t("admin.team.resend")}
                          </Button>
                        )}
                        {m.status === "disabled" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="team-enable"
                            icon={<UserCheck className="size-3.5" />}
                            onClick={() => toggle.mutate({ id: m.id, enabled: true })}
                          >
                            {t("admin.team.enable")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="team-disable"
                            disabled={realmAdmin}
                            title={realmAdmin ? t("admin.team.keycloakAdmin.hint") : undefined}
                            icon={<UserX className="size-3.5" />}
                            onClick={() => setDisabling(m)}
                          >
                            {t("admin.team.disable")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}

      <ConfirmDialog
        open={disabling !== null}
        onClose={() => setDisabling(null)}
        onConfirm={() => disabling && toggle.mutate({ id: disabling.id, enabled: false })}
        title={t("admin.team.disable.confirm", { email: disabling?.email ?? "" })}
        description={t("admin.team.disable.text")}
        confirmLabel={t("admin.team.disable")}
        cancelLabel={t("admin.team.cancel")}
        closeLabel={t("admin.team.close")}
        pending={toggle.isPending}
        testId="team-disable-dialog"
        confirmTestId="team-disable-confirm"
      />
      <EditDialog member={editing} roles={allRoles} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

/** One checkbox per role in the database, with whether it is country-scoped. */
function RolesChoice({ roles, value, onChange, testId }: { roles: readonly StaffRole[]; value: string[]; onChange: (next: string[]) => void; testId: string }) {
  const { t } = useAdminI18n();
  const roleName = useRoleName();
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid={`${testId}s`}>
      <legend className="mb-1.5 text-sm font-semibold">{t("admin.team.field.roles")}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {roles.map((role) => (
          <ChoiceLabel key={role.key}>
            <Checkbox
              data-testid={`${testId}-${role.key}`}
              checked={value.includes(role.key)}
              onChange={(e) => onChange(e.target.checked ? [...value, role.key] : value.filter((r) => r !== role.key))}
            />
            {roleName(role.key, roles)}
            {role.scoped && <span className="text-xs text-muted">({t("admin.team.roles.scoped").toLowerCase()})</span>}
          </ChoiceLabel>
        ))}
      </div>
    </fieldset>
  );
}

/** Edit someone's name, roles and countries. */
function EditDialog({ member, roles, onClose, onSaved }: { member: StaffMember | null; roles: readonly StaffRole[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useAdminI18n();
  return (
    <Dialog open={member !== null} onClose={onClose} title={t("admin.team.edit.title", { email: member?.email ?? "" })} closeLabel={t("admin.team.close")} testId="team-edit-dialog">
      {member && <EditForm member={member} roles={roles} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EditForm({ member, roles, onClose, onSaved }: { member: StaffMember; roles: readonly StaffRole[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useAdminI18n();
  const teamError = useTeamError();
  const [name, setName] = useState(member.name);
  const [picked, setPicked] = useState(member.roles);
  const [countries, setCountries] = useState(member.countries);
  const [cap, setCap] = useState(member.capUsd?.toString() ?? "");
  const [uncapped, setUncapped] = useState(member.uncapped);
  const capValid = cap.trim() === "" || (Number.isFinite(usdOrNull(cap)) && (usdOrNull(cap) ?? 0) >= 0);
  const scoped = needsCountries(picked, roles);
  const save = useMutation({
    mutationFn: async () => {
      const saved = await updateStaff(member.id, { name, roles: picked, countries: scoped ? countries : [] });
      const capUsd = usdOrNull(cap);
      if (capUsd !== member.capUsd || uncapped !== member.uncapped) return setStaffCap(member.id, { capUsd, uncapped });
      return saved;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label={t("admin.team.field.name")}>
        <Input data-testid="team-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <RolesChoice roles={roles} value={picked} onChange={setPicked} testId="team-edit-role" />
      {scoped && (
        <CountriesField
          testId="team-edit-countries"
          chipTestId="team-edit-country"
          label={t("admin.team.field.countries")}
          hint={t("admin.team.countries.hint")}
          empty={<span className="text-sm text-danger">{t("admin.team.countries.required")}</span>}
          value={countries}
          onChange={setCountries}
        />
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">{t("admin.team.cap")}</legend>
        <Field label={t("admin.team.cap.own")} hint={t("admin.team.cap.hint")} className="max-w-xs">
          <Input data-testid="team-edit-cap" inputMode="decimal" value={cap} disabled={uncapped} invalid={!capValid} onChange={(e) => setCap(e.target.value)} />
        </Field>
        <ChoiceLabel>
          <Checkbox data-testid="team-edit-uncapped" checked={uncapped} onChange={(e) => setUncapped(e.target.checked)} />
          {t("admin.team.cap.uncapped")}
        </ChoiceLabel>
      </fieldset>
      {save.isError && <ErrorText data-testid="team-edit-error">{teamError(save.error)}</ErrorText>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t("admin.team.cancel")}
        </Button>
        <Button type="submit" data-testid="team-edit-save" loading={save.isPending} disabled={picked.length === 0 || (scoped && countries.length === 0) || !capValid}>
          {t("admin.team.save")}
        </Button>
      </div>
    </form>
  );
}
