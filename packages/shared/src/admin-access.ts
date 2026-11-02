import { z } from "zod";

// ---- Who may open what in the admin ------------------------------------------------------------
//
// Permissions are the admin's sections (its nav). Roles come from Keycloak (realm roles) and map to
// permissions here, in one place: adding a role is a line in ROLE_PERMISSIONS plus the realm role
// in Keycloak (deploy/keycloak/configure.sh).

/** The admin's sections, in nav order. */
export const ADMIN_PERMISSIONS = ["dashboard", "books", "orders", "catalog", "methodologies", "themes", "reference", "journal", "seo"] as const;
export const AdminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export type AdminPermission = z.infer<typeof AdminPermissionSchema>;

/** Keycloak realm roles that open the admin. */
export const ADMIN_ROLES = ["admin", "seo"] as const;
export const AdminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

/** The role that may do everything, including what no permission names (unmarked admin routes). */
export const SUPER_ROLE: AdminRole = "admin";

/** What each role may open. */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: ADMIN_PERMISSIONS,
  seo: ["seo"],
};

/** The admin roles among a user's realm roles (unknown ones are ignored). */
export function adminRolesOf(roles: Iterable<string>): AdminRole[] {
  const set = new Set(roles);
  return ADMIN_ROLES.filter((role) => set.has(role));
}

/** Everything these roles may open, in nav order. */
export function permissionsOf(roles: readonly AdminRole[]): AdminPermission[] {
  const granted = new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
  return ADMIN_PERMISSIONS.filter((permission) => granted.has(permission));
}

/**
 * Whether these roles may use something that asks for any of `required`; with nothing required,
 * only the super role may (admin routes without an explicit permission stay admin-only).
 */
export function allowed(roles: readonly AdminRole[], required: readonly AdminPermission[] | undefined): boolean {
  if (roles.includes(SUPER_ROLE)) return true;
  if (!required?.length) return false;
  const granted = permissionsOf(roles);
  return required.some((permission) => granted.includes(permission));
}

/** GET /admin/me: who is signed in, their roles and the sections they may open. */
export const AdminMeSchema = z.object({
  ok: z.literal(true),
  who: z.string().nullable(),
  roles: z.array(AdminRoleSchema),
  permissions: z.array(AdminPermissionSchema),
});
export type AdminMe = z.infer<typeof AdminMeSchema>;

/** Body of a 403 from an admin route the session's roles do not open. */
export const ADMIN_FORBIDDEN = "admin_forbidden";
