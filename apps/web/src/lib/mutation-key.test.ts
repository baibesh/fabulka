import { describe, expect, it } from "vitest";
import { variablesKey } from "./mutation-key";

describe("mutation keys", () => {
  it("matches a call made twice with the same answers", () => {
    expect(variablesKey({ id: "a", enabled: true })).toBe(variablesKey({ id: "a", enabled: true }));
    expect(variablesKey(undefined)).toBe(variablesKey(undefined));
    expect(variablesKey(["kk"])).toBe(variablesKey(["kk"]));
  });

  it("tells different answers apart", () => {
    expect(variablesKey({ id: "a" })).not.toBe(variablesKey({ id: "b" }));
    expect(variablesKey({ id: "a", enabled: true })).not.toBe(variablesKey({ id: "a", enabled: false }));
    expect(variablesKey(undefined)).not.toBe(variablesKey(null));
  });

  it("counts a file as itself", () => {
    const one = new Blob(["x"]);
    const two = new Blob(["x"]);
    expect(variablesKey({ file: one })).toBe(variablesKey({ file: one }));
    expect(variablesKey({ file: one })).not.toBe(variablesKey({ file: two }));
  });

  it("survives a cycle", () => {
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(variablesKey(loop)).toBe(variablesKey(loop));
  });
});
