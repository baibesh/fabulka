import { z } from "zod";

// ---- Who may open what in the admin ------------------------------------------------------------
//
// A right is a section (plus, for a few sections, a part of one) and a scope. Code defines the
// sections (ADMIN_PERMISSIONS); the database defines the roles (StaffRole: which rights, and whether
// they hold only in the person's countries); the database also says who has which roles and
// countries (StaffMember, the admin's Team). Keycloak only says who someone is.
//
// A later step asks "may this session act on country X in section Y?" with allowedFor().

/**
 * The admin's sections, in nav order. `team` (staff and roles) is the superadmin's alone. `audit`
 * is the Activity section: who changed what (a country-scoped role sees its countries' events).
 * `consent` is the texts a parent accepts before a photo of the child goes to Meta (Global settings).
 */
export const ADMIN_PERMISSIONS = ["dashboard", "books", "orders", "catalog", "examples", "methodologies", "story_formats", "themes", "references", "reference", "consent", "journal", "audit", "seo", "team"] as const;
export const AdminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export type AdminPermission = z.infer<typeof AdminPermissionSchema>;

/**
 * Parts of a section a role may get without the whole section: "<section>.<part>". The whole
 * section covers its parts. Reference's per-country data: prices, landing (with its FAQ), delivery
 * cities, the delivery fee, and which print formats are offered and at what price. The rest of
 * Reference (the countries list, blocked countries, format specs, global defaults) is the whole
 * section's alone. The read parts open a section to look at without changing anything: books for an
 * illustrator's review (they may flag pages), themes and methods to see what references are for.
 */
export const ADMIN_SECTION_PARTS = [
  "books.review",
  "methodologies.read",
  "story_formats.read",
  "themes.read",
  "reference.prices",
  "reference.landing",
  "reference.cities",
  "reference.delivery",
  "reference.formats_country",
] as const;

/** Everything a role may be given: whole sections and section parts. */
export const ADMIN_RIGHTS = [...ADMIN_PERMISSIONS, ...ADMIN_SECTION_PARTS] as const;
export const AdminRightSchema = z.enum(ADMIN_RIGHTS);
export type AdminRight = z.infer<typeof AdminRightSchema>;

/** What a role other than the superadmin may hold: everything but `team`. */
export const ASSIGNABLE_RIGHTS: readonly AdminRight[] = ADMIN_RIGHTS.filter((right) => right !== "team");

/** The section a right belongs to: "reference.prices" → "reference". */
export function sectionOfRight(right: AdminRight): AdminPermission {
  return right.split(".")[0] as AdminPermission;
}

/** The superadmin role: every right everywhere, whatever the roles table says. */
export const SUPER_ROLE = "admin";

/**
 * Keycloak realm roles that still open the admin (deploy/keycloak/configure.sh grants them): on
 * sign-in their holder gets a staff row with the role of the same name. `admin` is the owner's way
 * in even with no row at all.
 */
export const REALM_ROLES = ["admin", "seo"] as const;
export type RealmRole = (typeof REALM_ROLES)[number];

/** The admin realm roles among a user's realm roles (unknown ones are ignored). */
export function realmRolesOf(roles: Iterable<string>): RealmRole[] {
  const set = new Set(roles);
  return REALM_ROLES.filter((role) => set.has(role));
}

/** A role's key: lower-case Latin letters, digits and underscores, starting with a letter. */
export const RoleKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/);

/** What the permission checks need of a role. */
export interface RoleDef {
  key: string;
  rights: readonly AdminRight[];
  /** Its rights hold only in the person's countries (StaffMember.countries). */
  scoped: boolean;
}

/**
 * The roles the database starts with (migration z18_staff seeds them; z20 and z21 add the country
 * manager's later rights: Reference's per-country parts, then its countries' dashboard and activity;
 * z25 adds the illustrator).
 */
export const BUILTIN_ROLES: readonly (RoleDef & { name: string; locked: boolean })[] = [
  { key: SUPER_ROLE, name: "Superadmin", rights: ADMIN_PERMISSIONS, scoped: false, locked: true },
  { key: "seo", name: "SEO", rights: ["seo"], scoped: false, locked: false },
  {
    key: "country_manager",
    name: "Country manager",
    rights: ["dashboard", "examples", "catalog", "orders", "reference.prices", "reference.landing", "reference.cities", "reference.delivery", "reference.formats_country", "audit"],
    scoped: true,
    locked: false,
  },
  /** Prepares the art references generation sends to Muse Image and reviews books' pictures (z25). */
  { key: "illustrator", name: "Illustrator", rights: ["references", "books.review", "themes.read", "methodologies.read"], scoped: false, locked: false },
];

/** The built-in roles' rights, by key. */
export const ROLE_PERMISSIONS: Record<string, readonly AdminRight[]> = Object.fromEntries(BUILTIN_ROLES.map((role) => [role.key, role.rights]));

/** The roles a realm role may never lose to an edit: deleting them would lock their holders out. */
export const UNDELETABLE_ROLES: readonly string[] = REALM_ROLES;

/** What a signed-in person may do: their roles' rights, split by scope, and their countries. */
export interface AdminAccess {
  /** The roles that resolved (known, and scoped ones only with countries), superadmin first. */
  roles: string[];
  /** Rights that hold everywhere. */
  global: AdminRight[];
  /** Rights that hold only in `countries`. */
  scoped: AdminRight[];
  /** Upper-case ISO codes the scoped rights hold in. */
  countries: string[];
}

export const NO_ACCESS: AdminAccess = { roles: [], global: [], scoped: [], countries: [] };

/**
 * What these roles open, given the role definitions. The superadmin role gets every right whatever
 * `defs` say; unknown roles are ignored; a scoped role without countries gives nothing; no role
 * but the superadmin's may hold `team`.
 */
export function accessOf(roles: readonly string[], defs: readonly RoleDef[], countries: readonly string[]): AdminAccess {
  const codes = [...new Set(countries.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (roles.includes(SUPER_ROLE)) {
    return { roles: [SUPER_ROLE, ...roles.filter((r) => r !== SUPER_ROLE)], global: [...ADMIN_RIGHTS], scoped: [], countries: codes };
  }
  const global = new Set<AdminRight>();
  const scoped = new Set<AdminRight>();
  const resolved: string[] = [];
  for (const key of new Set(roles)) {
    const def = defs.find((d) => d.key === key);
    if (!def || (def.scoped && !codes.length)) continue;
    resolved.push(key);
    for (const right of def.rights) {
      if (right === "team" || !(ADMIN_RIGHTS as readonly string[]).includes(right)) continue;
      (def.scoped ? scoped : global).add(right);
    }
  }
  return {
    roles: resolved,
    global: ADMIN_RIGHTS.filter((r) => global.has(r)),
    scoped: ADMIN_RIGHTS.filter((r) => scoped.has(r) && !covers([...global], r)),
    countries: resolved.length ? codes : [],
  };
}

/** The session holds the superadmin role. */
export function isSuperAdmin(access: Pick<AdminAccess, "roles">): boolean {
  return access.roles.includes(SUPER_ROLE);
}

/** Whether `granted` includes `right`: the right itself, or the whole section of a part. */
export function covers(granted: readonly AdminRight[], right: AdminRight): boolean {
  return granted.includes(right) || (right.includes(".") && granted.includes(sectionOfRight(right)));
}

/** The sections the nav shows: those with any right, whole or a part, in any scope; nav order. */
export function permissionsOf(access: AdminAccess): AdminPermission[] {
  const sections = new Set([...access.global, ...access.scoped].map(sectionOfRight));
  return ADMIN_PERMISSIONS.filter((section) => sections.has(section));
}

/** Every right the session holds in some scope, in ADMIN_RIGHTS order. */
export function rightsOf(access: AdminAccess): AdminRight[] {
  const all = [...access.global, ...access.scoped];
  return ADMIN_RIGHTS.filter((right) => covers(all, right));
}

/**
 * Whether the session may use a route that asks for any of `required`, in some scope (the route
 * itself narrows to countries with allowedFor). With nothing required, only the superadmin may:
 * admin routes without an explicit permission stay superadmin-only.
 */
export function allowed(access: AdminAccess, required: readonly AdminRight[] | undefined): boolean {
  if (isSuperAdmin(access)) return true;
  if (!required?.length) return false;
  const all = [...access.global, ...access.scoped];
  return required.some((right) => covers(all, right));
}

/**
 * Whether the session may act with `right` on something that belongs to `countries`: the
 * superadmin always; a global right always; a country-scoped right only when every one of those
 * countries is in the session's. No countries (null, or an empty list: shared, global or
 * "everywhere" content) needs a global right.
 */
export function allowedFor(access: AdminAccess, right: AdminRight, countries: readonly string[] | null | undefined): boolean {
  if (isSuperAdmin(access) || covers(access.global, right)) return true;
  if (!countries?.length || !covers(access.scoped, right)) return false;
  return countries.every((country) => access.countries.includes(country.trim().toUpperCase()));
}

/**
 * A list of known values in a response the admin reads: values this build does not know are dropped
 * instead of failing the whole response. A page left open across a deploy runs the old bundle while
 * the API already sends the new release's sections and rights; the rest of the page still works.
 * For responses only: input the API validates stays strict (AdminRightSchema).
 */
export function knownValues<const T extends readonly string[]>(values: T) {
  const known = new Set<string>(values);
  return z.array(z.string()).transform((list) => list.filter((value): value is T[number] => known.has(value)));
}

/**
 * GET /admin/me: who is signed in, their roles, the sections they may open and their countries.
 * Sections and rights this build does not know are dropped (knownValues).
 */
export const AdminMeSchema = z.object({
  ok: z.literal(true),
  who: z.string().nullable(),
  roles: z.array(z.string()),
  /** Sections for the nav. */
  permissions: knownValues(ADMIN_PERMISSIONS),
  /** Every right in some scope, parts included ("reference.prices"). */
  rights: knownValues(ADMIN_RIGHTS).default([]),
  /** Rights that hold everywhere; the rest hold only in `countries`. */
  global: knownValues(ADMIN_RIGHTS).default([]),
  /** The countries the country-scoped rights hold in (ISO codes); empty without such a role. */
  countries: z.array(z.string()).default([]),
  superadmin: z.boolean().default(false),
});
export type AdminMe = z.infer<typeof AdminMeSchema>;

/** Body of a 403 from an admin route the session's roles do not open. */
export const ADMIN_FORBIDDEN = "admin_forbidden";

/**
 * Body code of a 403 from a route the session may open but not for this thing: it belongs to (or
 * would reach) countries outside the session's, or to everywhere, which only global staff change.
 */
export const SCOPE_FORBIDDEN = "scope_forbidden";

/**
 * The countries `right` is limited to for this session: null when it holds everywhere (the
 * superadmin, a global right), else the session's countries (empty without the right at all).
 */
export function scopeOf(access: AdminAccess, right: AdminRight): string[] | null {
  if (isSuperAdmin(access) || covers(access.global, right)) return null;
  return covers(access.scoped, right) ? [...access.countries] : [];
}

/** The session's access as the admin pages see it (GET /admin/me), for allowedFor() in the browser. */
export function accessFromMe(me: AdminMe): AdminAccess {
  const global = me.superadmin ? [...ADMIN_RIGHTS] : me.global;
  return {
    roles: me.superadmin ? [SUPER_ROLE] : me.roles.filter((role) => role !== SUPER_ROLE),
    global,
    scoped: me.rights.filter((right) => !covers(global, right)),
    countries: me.countries,
  };
}
