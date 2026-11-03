import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ADMIN_RIGHTS,
  BUILTIN_ROLES,
  NO_ACCESS,
  ROLE_PERMISSIONS,
  accessOf,
  allowed,
  allowedFor,
  covers,
  permissionsOf,
  realmRolesOf,
  rightsOf,
  sectionOfRight,
  type RoleDef,
} from "./admin-access";
import { CreateStaffRoleSchema, InviteStaffSchema } from "./staff";

const DEFS: readonly RoleDef[] = BUILTIN_ROLES;
const superadmin = accessOf(["admin"], DEFS, []);
const seo = accessOf(["seo"], DEFS, []);
const de = accessOf(["country_manager"], DEFS, ["de"]);

describe("built-in roles", () => {
  it("give admin every section, team only to admin, seo only SEO", () => {
    expect(ROLE_PERMISSIONS.admin).toEqual(ADMIN_PERMISSIONS);
    expect(ROLE_PERMISSIONS.seo).toEqual(["seo"]);
    for (const [role, rights] of Object.entries(ROLE_PERMISSIONS)) {
      if (role !== "admin") expect(rights).not.toContain("team");
      for (const right of rights) expect(ADMIN_RIGHTS).toContain(right);
    }
  });

  it("make the country manager country-scoped with the per-country parts of Reference only", () => {
    const role = BUILTIN_ROLES.find((r) => r.key === "country_manager")!;
    expect(role.scoped).toBe(true);
    expect(role.rights).toEqual([
      "dashboard",
      "examples",
      "catalog",
      "orders",
      "reference.prices",
      "reference.landing",
      "reference.cities",
      "reference.delivery",
      "reference.formats_country",
      "audit",
    ]);
    expect(role.rights).not.toContain("reference");
  });
});

describe("accessOf and permissionsOf", () => {
  it("gives the nav sections of the roles", () => {
    expect(permissionsOf(seo)).toEqual(["seo"]);
    expect(permissionsOf(superadmin)).toEqual([...ADMIN_PERMISSIONS]);
    expect(permissionsOf(accessOf(["admin", "seo"], DEFS, []))).toEqual([...ADMIN_PERMISSIONS]);
    expect(permissionsOf(NO_ACCESS)).toEqual([]);
    expect(permissionsOf(de)).toEqual(["dashboard", "orders", "catalog", "examples", "reference", "audit"]);
  });

  it("keeps the superadmin a superadmin even when the roles table is empty", () => {
    const access = accessOf(["admin"], [], []);
    expect(access.roles).toEqual(["admin"]);
    expect(allowed(access, ["team"])).toBe(true);
  });

  it("ignores unknown roles, and scoped roles without countries", () => {
    expect(accessOf(["ghost"], DEFS, [])).toEqual(NO_ACCESS);
    expect(accessOf(["country_manager"], DEFS, [])).toEqual(NO_ACCESS);
  });

  it("upper-cases and dedupes countries", () => {
    expect(accessOf(["country_manager"], DEFS, ["de", "DE", " es "]).countries).toEqual(["DE", "ES"]);
  });

  it("never lets a non-superadmin role grant team", () => {
    const access = accessOf(["sneaky"], [{ key: "sneaky", rights: ["team", "orders"], scoped: false }], []);
    expect(access.global).toEqual(["orders"]);
    expect(allowed(access, ["team"])).toBe(false);
  });

  it("drops a scoped right a global role already covers", () => {
    const access = accessOf(["seo", "cm"], [...DEFS, { key: "cm", rights: ["seo", "orders"], scoped: true }], ["DE"]);
    expect(access.global).toEqual(["seo"]);
    expect(access.scoped).toEqual(["orders"]);
  });

  it("lists every right including parts", () => {
    expect(rightsOf(de)).toEqual([
      "dashboard",
      "orders",
      "catalog",
      "examples",
      "audit",
      "reference.prices",
      "reference.landing",
      "reference.cities",
      "reference.delivery",
      "reference.formats_country",
    ]);
    expect(rightsOf(superadmin)).toEqual([...ADMIN_RIGHTS]);
  });

  it("reads realm roles", () => {
    expect(realmRolesOf(["offline_access", "seo", "uma_authorization"])).toEqual(["seo"]);
    expect(realmRolesOf(new Set(["admin", "seo"]))).toEqual(["admin", "seo"]);
  });
});

describe("covers", () => {
  it("lets a whole section cover its parts, not the other way round", () => {
    expect(sectionOfRight("reference.prices")).toBe("reference");
    expect(covers(["reference"], "reference.prices")).toBe(true);
    expect(covers(["reference.prices"], "reference")).toBe(false);
    expect(covers(["reference.prices"], "reference.landing")).toBe(false);
  });
});

describe("allowed (section level)", () => {
  it("lets SEO into SEO only", () => {
    expect(allowed(seo, ["seo"])).toBe(true);
    expect(allowed(seo, ["orders"])).toBe(false);
    expect(allowed(seo, ["books", "catalog"])).toBe(false);
  });

  it("lets the superadmin in everywhere, also where no permission is named", () => {
    expect(allowed(superadmin, ["orders"])).toBe(true);
    expect(allowed(superadmin, undefined)).toBe(true);
    expect(allowed(superadmin, [])).toBe(true);
  });

  it("keeps routes without a permission superadmin-only", () => {
    expect(allowed(seo, undefined)).toBe(false);
    expect(allowed(de, [])).toBe(false);
    expect(allowed(NO_ACCESS, ["seo"])).toBe(false);
  });

  it("passes when any of the required rights is granted", () => {
    expect(allowed(seo, ["catalog", "seo"])).toBe(true);
  });

  it("lets a country manager into its sections, not the whole reference or team", () => {
    expect(allowed(de, ["examples"])).toBe(true);
    expect(allowed(de, ["orders"])).toBe(true);
    expect(allowed(de, ["reference.prices"])).toBe(true);
    expect(allowed(de, ["reference"])).toBe(false);
    expect(allowed(de, ["seo"])).toBe(false);
    expect(allowed(de, ["team"])).toBe(false);
  });
});

describe("allowedFor (section + country)", () => {
  it("passes the superadmin everywhere, also for global content", () => {
    expect(allowedFor(superadmin, "examples", ["DE"])).toBe(true);
    expect(allowedFor(superadmin, "examples", null)).toBe(true);
    expect(allowedFor(superadmin, "team", [])).toBe(true);
  });

  it("lets a country manager act only inside its countries", () => {
    expect(allowedFor(de, "examples", ["DE"])).toBe(true);
    expect(allowedFor(de, "examples", ["de"])).toBe(true);
    expect(allowedFor(de, "examples", ["DE", "ES"])).toBe(false);
    expect(allowedFor(de, "examples", ["KZ"])).toBe(false);
    expect(allowedFor(de, "reference.prices", ["DE"])).toBe(true);
    expect(allowedFor(de, "reference", ["DE"])).toBe(false);
    expect(allowedFor(de, "seo", ["DE"])).toBe(false);
  });

  it("keeps shared and global content for global rights", () => {
    expect(allowedFor(de, "examples", null)).toBe(false);
    expect(allowedFor(de, "examples", [])).toBe(false);
    expect(allowedFor(de, "reference.prices", undefined)).toBe(false);
  });

  it("leaves SEO as it was: global, SEO only", () => {
    expect(allowedFor(seo, "seo", null)).toBe(true);
    expect(allowedFor(seo, "seo", ["DE"])).toBe(true);
    expect(allowedFor(seo, "examples", ["DE"])).toBe(false);
  });

  it("works for a custom role from the database", () => {
    const access = accessOf(["orders_only"], [{ key: "orders_only", rights: ["orders"], scoped: false }], []);
    expect(permissionsOf(access)).toEqual(["orders"]);
    expect(allowedFor(access, "orders", null)).toBe(true);
    expect(allowedFor(access, "catalog", null)).toBe(false);
  });
});

describe("Team schemas", () => {
  it("lower-cases the invite email and dedupes countries", () => {
    const invite = InviteStaffSchema.parse({ email: " Anna@Example.COM ", roles: ["country_manager"], countries: ["de", "DE"] });
    expect(invite.email).toBe("anna@example.com");
    expect(invite.countries).toEqual(["DE"]);
    expect(InviteStaffSchema.safeParse({ email: "x@y.z", roles: [] }).success).toBe(false);
  });

  it("refuses a role holding team or a bad key", () => {
    expect(CreateStaffRoleSchema.safeParse({ key: "orders_only", name: "Orders", rights: ["orders"], scoped: false }).success).toBe(true);
    expect(CreateStaffRoleSchema.safeParse({ key: "xx", name: "X", rights: ["team"], scoped: false }).success).toBe(false);
    expect(CreateStaffRoleSchema.safeParse({ key: "Bad Key", name: "X", rights: ["orders"], scoped: false }).success).toBe(false);
    expect(CreateStaffRoleSchema.safeParse({ key: "empty", name: "X", rights: [], scoped: false }).success).toBe(false);
  });
});
