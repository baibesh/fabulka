import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, ROLE_PERMISSIONS, adminRolesOf, allowed, permissionsOf } from "./admin-access";

describe("ROLE_PERMISSIONS", () => {
  it("gives admin every section and seo only SEO", () => {
    expect(ROLE_PERMISSIONS.admin).toEqual(ADMIN_PERMISSIONS);
    expect(ROLE_PERMISSIONS.seo).toEqual(["seo"]);
    expect(permissionsOf(["seo"])).toEqual(["seo"]);
    expect(permissionsOf(["admin", "seo"])).toEqual([...ADMIN_PERMISSIONS]);
    expect(permissionsOf([])).toEqual([]);
  });

  it("names only real sections", () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const p of permissions) expect(ADMIN_PERMISSIONS).toContain(p);
    }
  });
});

describe("adminRolesOf", () => {
  it("keeps the admin roles among a user's realm roles", () => {
    expect(adminRolesOf(["offline_access", "seo", "uma_authorization"])).toEqual(["seo"]);
    expect(adminRolesOf(new Set(["admin", "seo"]))).toEqual(["admin", "seo"]);
    expect(adminRolesOf([])).toEqual([]);
  });
});

describe("allowed", () => {
  it("lets the SEO role into SEO only", () => {
    expect(allowed(["seo"], ["seo"])).toBe(true);
    expect(allowed(["seo"], ["orders"])).toBe(false);
    expect(allowed(["seo"], ["books", "catalog"])).toBe(false);
  });

  it("lets admin in everywhere, unmarked routes included", () => {
    expect(allowed(["admin"], ["orders"])).toBe(true);
    expect(allowed(["admin"], undefined)).toBe(true);
    expect(allowed(["admin"], [])).toBe(true);
  });

  it("keeps unmarked routes admin-only", () => {
    expect(allowed(["seo"], undefined)).toBe(false);
    expect(allowed([], ["seo"])).toBe(false);
  });

  it("accepts any one of several permissions", () => {
    expect(allowed(["seo"], ["catalog", "seo"])).toBe(true);
  });
});
