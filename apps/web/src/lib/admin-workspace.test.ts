import { BUILTIN_ROLES, SUPER_ROLE, accessOf } from "@fabulka/shared";
import { describe, expect, it } from "vitest";
import { activeEntry, canOpen, navFor, switchTarget, workspaceOf } from "./admin-workspace";

const SUPER = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);
const DE = accessOf(["country_manager"], BUILTIN_ROLES, ["DE"]);
const ILLUSTRATOR = accessOf(["illustrator"], BUILTIN_ROLES, []);
const SEO = accessOf(["seo"], BUILTIN_ROLES, []);

const ids = (groups: ReturnType<typeof navFor>) => groups.flatMap((group) => group.items.map((item) => item.id));

describe("navFor", () => {
  it("gives the superadmin the whole global menu, grouped", () => {
    const groups = navFor(SUPER, null);
    expect(groups.map((group) => group.id)).toEqual(["home", "operations", "studio", "growth", "admin"]);
    expect(ids(groups)).toContain("consent");
    expect(ids(groups)).not.toContain("landing");
  });

  it("gives a country's menu in a country workspace", () => {
    expect(ids(navFor(SUPER, "DE"))).toEqual(["inbox", "landing", "examples", "catalog", "prices", "print-formats", "cities", "orders", "activity", "preview"]);
  });

  it("shows a country manager their country's menu, and nothing of Global or another country", () => {
    expect(ids(navFor(DE, "DE"))).toEqual(["inbox", "landing", "examples", "catalog", "prices", "print-formats", "cities", "orders", "activity", "preview"]);
    expect(ids(navFor(DE, "KZ"))).toEqual(["inbox"]);
    expect(ids(navFor(DE, null))).toEqual(["inbox"]);
  });

  it("keeps an illustrator's and an SEO person's menus short", () => {
    expect(ids(navFor(ILLUSTRATOR, null))).toEqual(["inbox", "books", "methodologies", "themes", "references"]);
    expect(ids(navFor(SEO, null))).toEqual(["inbox", "seo"]);
  });
});

describe("canOpen", () => {
  it("opens the Inbox to everyone and pages by their rights", () => {
    expect(canOpen(SEO, "/admin")).toBe(true);
    expect(canOpen(SEO, "/admin/seo/edit")).toBe(true);
    expect(canOpen(SEO, "/admin/orders")).toBe(false);
    expect(canOpen(DE, "/admin/landing")).toBe(true);
    expect(canOpen(DE, "/admin/settings")).toBe(false); // a scoped dashboard is not the global one
    expect(canOpen(DE, "/admin/team")).toBe(false);
    expect(canOpen(DE, "/admin/consent")).toBe(false);
    expect(canOpen(SUPER, "/admin/consent")).toBe(true);
    // /admin/reference is not under /admin/references.
    expect(canOpen(ILLUSTRATOR, "/admin/references")).toBe(true);
    expect(canOpen(ILLUSTRATOR, "/admin/reference")).toBe(false);
  });
});

describe("workspaceOf and switchTarget", () => {
  it("knows which pages belong where", () => {
    expect(workspaceOf("/admin")).toBe("both");
    expect(workspaceOf("/admin/orders")).toBe("both");
    expect(workspaceOf("/admin/prices")).toBe("country");
    expect(workspaceOf("/admin/books/b1")).toBe("global");
  });

  it("stays on a page both workspaces have, else lands on the Inbox", () => {
    expect(switchTarget(SUPER, "/admin/orders", "DE")).toBe("/admin/orders");
    expect(switchTarget(SUPER, "/admin/orders", null)).toBe("/admin/orders");
    expect(switchTarget(SUPER, "/admin/books/b1", "DE")).toBe("/admin");
    expect(switchTarget(SUPER, "/admin/prices", null)).toBe("/admin");
    expect(switchTarget(SUPER, "/admin/prices", "AT")).toBe("/admin/prices");
    expect(switchTarget(SUPER, "/admin/catalog/sea", "DE")).toBe("/admin/catalog/sea");
    expect(switchTarget(SUPER, "/admin", "DE")).toBe("/admin");
  });

  it("highlights the longest matching entry", () => {
    expect(activeEntry(navFor(SUPER, "DE"), "/admin/examples/matrix")?.id).toBe("preview");
    expect(activeEntry(navFor(SUPER, null), "/admin/examples/matrix")?.id).toBe("matrix");
    expect(activeEntry(navFor(SUPER, null), "/admin")?.id).toBe("inbox");
    expect(activeEntry(navFor(SUPER, null), "/admin/books/b1")?.id).toBe("books");
  });
});
