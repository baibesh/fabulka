/** Ids for files and objects that can't be written out as JSON, so two different ones never match. */
const ids = new WeakMap<object, number>();
let lastId = 0;
const idOf = (value: object) => {
  if (!ids.has(value)) ids.set(value, ++lastId);
  return ids.get(value)!;
};

/**
 * What a mutation is called with, as a string: two calls with the same answers (a double click, a
 * form sent twice) give the same key; a file counts as itself, not by its contents.
 */
export function variablesKey(variables: unknown): string {
  try {
    return JSON.stringify(variables, (_key, value: unknown) => (value instanceof Blob ? `blob#${idOf(value)}` : value)) ?? String(variables);
  } catch {
    // A cycle: only the same object is the same call.
    return typeof variables === "object" && variables !== null ? `ref#${idOf(variables)}` : String(variables);
  }
}
