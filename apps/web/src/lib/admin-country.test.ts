import { describe, expect, it } from "vitest";
import { parseCountryParam, resolveWorkingCountry, withCountry, type CountryScope } from "./admin-country";

const manager: CountryScope = { options: ["DE", "AT"], allowAll: false, loaded: true };
const superadmin: CountryScope = { options: ["KZ", "DE", "US"], allowAll: true, loaded: true };
const superadminLoading: CountryScope = { options: [], allowAll: true, loaded: false };

describe("parseCountryParam", () => {
  it("reads a code in any case, all, and nothing", () => {
    expect(parseCountryParam("DE")).toEqual({ kind: "country", code: "DE" });
    expect(parseCountryParam(" de ")).toEqual({ kind: "country", code: "DE" });
    expect(parseCountryParam("all")).toEqual({ kind: "all" });
    expect(parseCountryParam("ALL")).toEqual({ kind: "all" });
    expect(parseCountryParam(null)).toEqual({ kind: "none" });
    expect(parseCountryParam(undefined)).toEqual({ kind: "none" });
    expect(parseCountryParam("")).toEqual({ kind: "none" });
  });

  it("calls anything else invalid", () => {
    expect(parseCountryParam("germany")).toEqual({ kind: "invalid", raw: "germany" });
    expect(parseCountryParam("D1")).toEqual({ kind: "invalid", raw: "D1" });
  });
});

describe("resolveWorkingCountry: defaults", () => {
  it("gives a manager their first country", () => {
    expect(resolveWorkingCountry(null, manager)).toEqual({ country: "DE", param: "DE", refused: null, settled: true });
  });

  it("gives global staff all countries", () => {
    expect(resolveWorkingCountry(null, superadmin)).toEqual({ country: null, param: "all", refused: null, settled: true });
  });

  it("uses the remembered choice when it is still allowed", () => {
    expect(resolveWorkingCountry(null, manager, "AT").param).toBe("AT");
    expect(resolveWorkingCountry(null, superadmin, "DE").param).toBe("DE");
    expect(resolveWorkingCountry(null, superadmin, "all").param).toBe("all");
  });

  it("ignores a remembered choice out of scope", () => {
    expect(resolveWorkingCountry(null, manager, "KZ").param).toBe("DE");
    expect(resolveWorkingCountry(null, manager, "all").param).toBe("DE");
    expect(resolveWorkingCountry(null, superadmin, "FR").param).toBe("all");
    expect(resolveWorkingCountry(null, manager, "junk").param).toBe("DE");
  });
});

describe("resolveWorkingCountry: the address wins", () => {
  it("over the remembered choice", () => {
    expect(resolveWorkingCountry("AT", manager, "DE")).toEqual({ country: "AT", param: "AT", refused: null, settled: true });
    expect(resolveWorkingCountry("all", superadmin, "DE")).toEqual({ country: null, param: "all", refused: null, settled: true });
    expect(resolveWorkingCountry("de", superadmin, "all").param).toBe("DE");
  });
});

describe("resolveWorkingCountry: validation", () => {
  it("refuses another country's link for a manager and shows their own", () => {
    expect(resolveWorkingCountry("KZ", manager)).toEqual({ country: "DE", param: "DE", refused: "KZ", settled: true });
    expect(resolveWorkingCountry("KZ", manager, "AT")).toMatchObject({ param: "AT", refused: "KZ" });
  });

  it("refuses all countries for a manager", () => {
    expect(resolveWorkingCountry("all", manager)).toMatchObject({ param: "DE", refused: "all" });
  });

  it("refuses a country the site does not offer for global staff", () => {
    expect(resolveWorkingCountry("FR", superadmin)).toMatchObject({ country: null, param: "all", refused: "FR" });
  });

  it("refuses a malformed value", () => {
    expect(resolveWorkingCountry("germany", manager)).toMatchObject({ param: "DE", refused: "germany" });
    expect(resolveWorkingCountry("x", superadmin)).toMatchObject({ param: "all", refused: "x" });
  });
});

describe("resolveWorkingCountry: while global staff's countries load", () => {
  it("uses the address's country without settling", () => {
    expect(resolveWorkingCountry("DE", superadminLoading)).toEqual({ country: "DE", param: "DE", refused: null, settled: false });
  });

  it("settles all countries at once", () => {
    expect(resolveWorkingCountry(null, superadminLoading)).toEqual({ country: null, param: "all", refused: null, settled: true });
    expect(resolveWorkingCountry("all", superadminLoading).settled).toBe(true);
  });

  it("does not settle a remembered country", () => {
    expect(resolveWorkingCountry(null, superadminLoading, "DE")).toMatchObject({ param: "DE", settled: false });
  });
});

describe("withCountry", () => {
  it("adds the parameter", () => {
    expect(withCountry("/admin/orders", "DE")).toBe("/admin/orders?country=DE");
    expect(withCountry("/admin", "all")).toBe("/admin?country=all");
  });

  it("keeps other parameters and the hash, and replaces an old value", () => {
    expect(withCountry("/admin/seo?version=de", "DE")).toBe("/admin/seo?version=de&country=DE");
    expect(withCountry("/admin/orders?country=KZ#top", "DE")).toBe("/admin/orders?country=DE#top");
  });

  it("leaves the link alone without a value", () => {
    expect(withCountry("/admin/orders", null)).toBe("/admin/orders");
  });
});
