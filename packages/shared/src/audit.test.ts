import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AuditQuerySchema, StaffCapOverrideSchema, budgetOf, personCap, remaining } from "./audit";

const defaults = { personUsd: 2, countryUsd: 10 };

describe("staff caps", () => {
  it("leaves what is left of a cap, never below zero, or null without one", () => {
    expect(remaining(1, 0.25)).toBe(0.75);
    expect(remaining(1, 3)).toBe(0);
    expect(remaining(null, 3)).toBeNull();
  });

  it("picks the cap that holds for someone", () => {
    expect(personCap(null, false, defaults)).toBe(2);
    expect(personCap({ capUsd: null, uncapped: false }, false, defaults)).toBe(2);
    expect(personCap({ capUsd: 5, uncapped: false }, false, defaults)).toBe(5);
    expect(personCap({ capUsd: 5, uncapped: true }, false, defaults)).toBeNull();
    // A superadmin is uncapped by default, capped only by a cap of their own.
    expect(personCap(null, true, defaults)).toBeNull();
    expect(personCap({ capUsd: 1, uncapped: false }, true, defaults)).toBe(1);
  });

  it("allows an action while every line that caps has money left", () => {
    const base = { personCapUsd: 2, personSpentUsd: 1, country: "DE", countryCapUsd: 10, countrySpentUsd: 3 };
    expect(budgetOf(base)).toMatchObject({ remainingUsd: 1, allowed: true });
    expect(budgetOf({ ...base, personSpentUsd: 2 })).toMatchObject({ remainingUsd: 0, allowed: false });
    expect(budgetOf({ ...base, countrySpentUsd: 10 })).toMatchObject({ remainingUsd: 0, allowed: false });
    expect(budgetOf({ ...base, personCapUsd: null, countryCapUsd: null })).toMatchObject({ remainingUsd: null, allowed: true });
    expect(budgetOf({ ...base, country: null }).country).toBeNull();
  });

  it("takes an override of a cap or none", () => {
    expect(StaffCapOverrideSchema.parse({ capUsd: null })).toEqual({ capUsd: null, uncapped: false });
    expect(() => StaffCapOverrideSchema.parse({ capUsd: -1 })).toThrow();
  });
});

describe("activity", () => {
  it("lists action codes once each", () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it("reads the filters, lower-casing the person and bounding the page", () => {
    expect(AuditQuerySchema.parse({ actor: " Anna@E2E.test ", limit: "50" }).actor).toBe("anna@e2e.test");
    expect(() => AuditQuerySchema.parse({ limit: "500" })).toThrow();
    expect(AuditQuerySchema.parse({ country: "de" }).country).toBe("DE");
    expect(() => AuditQuerySchema.parse({ from: "yesterday" })).toThrow();
  });
});
