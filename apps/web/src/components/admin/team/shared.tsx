"use client";

import { ADMIN_SECTION_PARTS, ASSIGNABLE_RIGHTS, TEAM_ERRORS, sectionOfRight, type AdminRight, type StaffRole, type TeamError } from "@fabulka/shared";
import type { MessageKey } from "@/i18n/messages";
import { Checkbox } from "@/components/ui/choice";
import { ApiError } from "@/lib/api";
import { useAdminI18n } from "../ui";

export const MEMBERS_QUERY = ["admin", "team", "members"] as const;
export const ROLES_QUERY = ["admin", "team", "roles"] as const;

/** Built-in roles have names in every admin language; the rest show the name they were given. */
const BUILTIN_NAMES: Record<string, MessageKey> = {
  admin: "admin.team.role.admin",
  seo: "admin.team.role.seo",
  country_manager: "admin.team.role.country_manager",
};

export function useRoleName() {
  const { t } = useAdminI18n();
  return (key: string, roles?: readonly StaffRole[]) => {
    const builtin = BUILTIN_NAMES[key];
    if (builtin) return t(builtin);
    return roles?.find((r) => r.key === key)?.name ?? key;
  };
}

/** A right's label: the section's nav name, or "Reference: prices" for a part. */
export function useRightName() {
  const { t } = useAdminI18n();
  return (right: AdminRight) => (right.includes(".") ? t(`admin.team.right.${right as (typeof ADMIN_SECTION_PARTS)[number]}`) : t(`admin.nav.${sectionOfRight(right)}`));
}

/** A Team refusal in the admin's words (admin.team.error.<code>), else its message. */
export function useTeamError() {
  const { t } = useAdminI18n();
  return (error: Error | null) => {
    if (!error) return null;
    if (error instanceof ApiError && (TEAM_ERRORS as readonly string[]).includes(error.code ?? "")) {
      return t(`admin.team.error.${error.code as TeamError}`);
    }
    return error.message;
  };
}

/** Sections in nav order, each with its parts. */
const PICKER_GROUPS: AdminRight[][] = ASSIGNABLE_RIGHTS.filter((r) => !r.includes(".")).map((section) => [
  section,
  ...ASSIGNABLE_RIGHTS.filter((r) => r.startsWith(`${section}.`)),
]);

/** Whether the role's name comes from the admin's messages (so it is not edited). */
export const hasBuiltinName = (key: string) => key in BUILTIN_NAMES;

/**
 * Checkboxes for a role's rights, a section's parts right under it (ticking the whole section
 * covers its parts, so they are shown ticked and locked). `testId` prefixes each box's test id.
 */
export function RightsPicker({
  value,
  onChange,
  testId,
  disabled = false,
}: {
  value: readonly AdminRight[];
  onChange: (next: AdminRight[]) => void;
  testId: string;
  disabled?: boolean;
}) {
  const rightName = useRightName();
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {PICKER_GROUPS.map((group) => (
        <div key={group[0]} className="flex flex-col gap-1">
          {group.map((right) => {
            const part = right.includes(".");
            const coveredBySection = part && value.includes(sectionOfRight(right));
            const checked = value.includes(right) || coveredBySection;
            return (
              <label key={right} className={`flex items-center gap-2 py-0.5 text-sm ${part ? "pl-6" : "font-semibold"}`}>
                <Checkbox
                  data-testid={`${testId}-${right}`}
                  checked={checked}
                  disabled={disabled || coveredBySection}
                  onChange={(event) => {
                    const rest = value.filter((r) => r !== right);
                    if (!event.target.checked) return onChange(rest);
                    // A whole section makes its parts redundant.
                    const next = part ? [...rest, right] : [...rest.filter((r) => !r.startsWith(`${right}.`)), right];
                    onChange(ASSIGNABLE_RIGHTS.filter((r) => next.includes(r)));
                  }}
                />
                {rightName(right)}
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
