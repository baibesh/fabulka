import { AdminMeSchema } from "@fabulka/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { humanizeError, isOutdatedError } from "./outdated";

/** What a page older than the API gets: a response its schemas refuse. */
function schemaFailure(): Error {
  const parsed = AdminMeSchema.safeParse({ ok: true, who: null, roles: [], permissions: "dashboard" });
  if (parsed.success) throw new Error("expected a failure");
  return parsed.error;
}

describe("outdated responses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells a schema failure from any other error", () => {
    expect(isOutdatedError(schemaFailure())).toBe(true);
    expect(isOutdatedError(new Error("Internal Server Error"))).toBe(false);
    expect(isOutdatedError("ZodError")).toBe(false);
  });

  it("swaps the zod issues for a sentence in the page's language", () => {
    vi.stubGlobal("document", { documentElement: { lang: "de" } });
    const error = schemaFailure();
    expect(error.message).toContain("invalid_type");
    humanizeError(error);
    expect(error.message).toBe("Diese Seite ist veraltet – bitte neu laden, um fortzufahren.");
    expect(isOutdatedError(error)).toBe(true);
  });

  it("falls back to English and leaves other errors alone", () => {
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    const error = schemaFailure();
    humanizeError(error);
    expect(error.message).toBe("This page is out of date — reload it to continue.");
    const api = new Error("Generation is paused");
    humanizeError(api);
    expect(api.message).toBe("Generation is paused");
  });
});
