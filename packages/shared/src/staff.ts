import { z } from "zod";
import { ASSIGNABLE_RIGHTS, AdminRightSchema, RoleKeySchema } from "./admin-access";
import { CountryCodeSchema } from "./reference";

// ---- Team: staff and roles (admin «Team», superadmin only) -------------------------------------

/** invited: the row exists, they have not signed in yet; disabled: no admin, whatever the roles. */
export const STAFF_STATUSES = ["invited", "active", "disabled"] as const;
export const StaffStatusSchema = z.enum(STAFF_STATUSES);
export type StaffStatus = z.infer<typeof StaffStatusSchema>;

const StaffEmailSchema = z.string().trim().toLowerCase().max(200).pipe(z.email());
const StaffNameSchema = z.string().trim().max(100);
const StaffRolesSchema = z.array(RoleKeySchema).min(1).max(20);
const StaffCountriesSchema = z
  .array(CountryCodeSchema)
  .max(100)
  .transform((codes) => [...new Set(codes)]);

/** A member of staff as the Team list shows them. */
export const StaffMemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  countries: z.array(z.string()),
  status: StaffStatusSchema,
  /** They have signed in with Keycloak at least once (the Keycloak user is linked). */
  linked: z.boolean(),
  /** Keycloak realm roles seen at their last sign-in (admin, seo): realm `admin` is a superadmin there. */
  realmRoles: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

/** POST /admin/team: invite someone. */
export const InviteStaffSchema = z.object({
  email: StaffEmailSchema,
  name: StaffNameSchema.default(""),
  roles: StaffRolesSchema,
  countries: StaffCountriesSchema.default([]),
});
export type InviteStaff = z.input<typeof InviteStaffSchema>;

/** PATCH /admin/team/:id: change their name, roles or countries. */
export const UpdateStaffSchema = z.object({
  name: StaffNameSchema.optional(),
  roles: StaffRolesSchema.optional(),
  countries: StaffCountriesSchema.optional(),
});
export type UpdateStaff = z.input<typeof UpdateStaffSchema>;

/**
 * What happened to the invitation email: sent by Keycloak; not_configured when the API has no
 * Keycloak admin client (local runs, E2E); not_needed when their Keycloak account needs nothing set
 * up; failed when Keycloak refused (the row is saved all the same).
 */
export const INVITE_EMAIL_STATUSES = ["sent", "not_configured", "not_needed", "failed"] as const;
export const InviteEmailStatusSchema = z.enum(INVITE_EMAIL_STATUSES);
export type InviteEmailStatus = z.infer<typeof InviteEmailStatusSchema>;

/** Answer of an invite or a resend. */
export const InviteResultSchema = z.object({ member: StaffMemberSchema, email: InviteEmailStatusSchema });
export type InviteResult = z.infer<typeof InviteResultSchema>;

/** A role as the Roles tab shows it. */
export const StaffRoleSchema = z.object({
  key: z.string(),
  name: z.string(),
  rights: z.array(AdminRightSchema),
  scoped: z.boolean(),
  /** The superadmin role: every right, never edited. */
  locked: z.boolean(),
  /** A Keycloak realm role maps to it, so it is never deleted. */
  builtin: z.boolean(),
  /** How many staff rows hold it. */
  members: z.number().int(),
});
export type StaffRole = z.infer<typeof StaffRoleSchema>;

const RoleRightsSchema = z
  .array(AdminRightSchema)
  .min(1)
  .max(ASSIGNABLE_RIGHTS.length)
  .refine((rights) => rights.every((right) => ASSIGNABLE_RIGHTS.includes(right)), "Team is the superadmin's alone")
  .transform((rights) => [...new Set(rights)]);

/** POST /admin/team/roles. */
export const CreateStaffRoleSchema = z.object({
  key: RoleKeySchema,
  name: z.string().trim().min(1).max(60),
  rights: RoleRightsSchema,
  scoped: z.boolean(),
});
export type CreateStaffRole = z.input<typeof CreateStaffRoleSchema>;

/** PUT /admin/team/roles/:key. */
export const UpdateStaffRoleSchema = CreateStaffRoleSchema.omit({ key: true });
export type UpdateStaffRole = z.input<typeof UpdateStaffRoleSchema>;

/** Codes of the Team refusals (the body's `code`); the admin shows each in its own words. */
export const TEAM_ERRORS = [
  "staff_exists",
  "staff_not_found",
  "staff_unknown_role",
  "staff_countries_required",
  "staff_last_superadmin",
  "staff_realm_admin",
  "role_exists",
  "role_not_found",
  "role_locked",
  "role_builtin",
  "role_in_use",
] as const;
export type TeamError = (typeof TEAM_ERRORS)[number];
