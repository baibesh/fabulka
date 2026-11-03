import type { AuditChange, AuditEvent, AuditSummary } from '@fabulka/shared';

// ---- What an audit event keeps of a change ---------------------------------------------------------
//
// Pure helpers the recorder and the routes share: a value made safe to store (secrets redacted, a
// book's contents and personal data left out, long strings cut), a field diff of two values, a size
// cap on the whole summary, and the CSV of a list of events.

/** Keys whose values are never stored: credentials of any kind. */
const SECRET_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|otp|credential|private[-_]?key/i;
/**
 * Keys whose values are never stored: a book's contents and the child's data (a book's pages and
 * questions, the child's profile, prompts and model output) and uploaded files (base64 images).
 */
const CONTENT_KEYS = new Set([
  'pages',
  'story',
  'talkQuestions',
  'child',
  'prompt',
  'output',
  'image',
  'photo',
]);
export const REDACTED = '[redacted]';
export const OMITTED = '[omitted]';
/** A string longer than this is cut. */
export const STRING_LIMIT = 200;
/** Objects deeper than this are summarised by their keys. */
const DEPTH_LIMIT = 6;
/** Arrays longer than this keep only their first items. */
const ARRAY_LIMIT = 50;
/** A diff whose before/after values take more than this (as JSON) keeps only the changed paths. */
export const DIFF_LIMIT = 4_000;
/** The whole summary of an event, as JSON, at most this long. */
export const SUMMARY_LIMIT = 8_000;
/** At most this many changed paths are kept. */
const PATHS_LIMIT = 100;

/** A string cut to `limit` characters, marked with how long it was. */
export function cut(text: string, limit = STRING_LIMIT): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}… (${text.length} chars)`;
}

/**
 * `value` as it may be stored: secrets redacted, contents left out, strings cut, deep objects and
 * long arrays shortened. Never throws; functions, symbols and undefined are dropped.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return cut(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return null;
  if (depth >= DEPTH_LIMIT)
    return Array.isArray(value) ? `[${value.length}]` : '{…}';
  if (Array.isArray(value)) {
    const items = value
      .slice(0, ARRAY_LIMIT)
      .map((v) => sanitize(v, depth + 1));
    if (value.length > ARRAY_LIMIT) items.push(`… (${value.length} items)`);
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || typeof item === 'function') continue;
    if (SECRET_KEY.test(key)) out[key] = REDACTED;
    else if (CONTENT_KEYS.has(key)) out[key] = OMITTED;
    else out[key] = sanitize(item, depth + 1);
  }
  return out;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The key array items are known by (id, code, key, slug, language): one each, unique per side. */
function itemKey(...sides: unknown[][]): string | null {
  const all = sides.flat();
  if (!all.length || !all.every(isObject)) return null;
  for (const key of ['id', 'code', 'key', 'slug', 'language']) {
    const fits = sides.every((side) => {
      const keys = (side as Record<string, unknown>[]).map((item) => item[key]);
      return (
        keys.every((k) => typeof k === 'string' || typeof k === 'number') &&
        new Set(keys).size === keys.length
      );
    });
    if (fits) return key;
  }
  return null;
}

/** An array of keyed objects as an object by that key, so a diff names the item that changed. */
function keyed(value: unknown, key: string | null): unknown {
  if (!key || !Array.isArray(value)) return value;
  return Object.fromEntries(
    value.map((item) => [String((item as Record<string, unknown>)[key]), item]),
  );
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Every changed leaf between two sanitized values, by path ("books.template.KZT"). */
export function changes(
  before: unknown,
  after: unknown,
  path = '',
): AuditChange[] {
  if (same(before, after)) return [];
  // A thing made or removed: compared with nothing, field by field (a list of keyed items too).
  const empty = (value: unknown) =>
    isObject(value)
      ? {}
      : Array.isArray(value) && itemKey(value as unknown[])
        ? []
        : undefined;
  if (before == null && empty(after) !== undefined)
    return changes(empty(after), after, path);
  if (after == null && empty(before) !== undefined)
    return changes(before, empty(before), path);
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = itemKey(before as unknown[], after as unknown[]);
    if (key) return changes(keyed(before, key), keyed(after, key), path);
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((key) =>
      changes(before[key], after[key], path ? `${path}.${key}` : key),
    );
  }
  const change: AuditChange = { path: path || '$' };
  if (before !== undefined) change.before = before;
  if (after !== undefined) change.after = after;
  return [change];
}

/**
 * What changed between `before` and `after`, made safe to store: each changed value with before
 * and after while they are small, else only the changed paths.
 */
export function diffSummary(before: unknown, after: unknown): AuditSummary {
  const found = changes(sanitize(before), sanitize(after));
  if (!found.length) return { changes: [] };
  if (JSON.stringify(found).length <= DIFF_LIMIT) return { changes: found };
  const keys = found.map((c) => c.path);
  return keys.length > PATHS_LIMIT
    ? { keys: keys.slice(0, PATHS_LIMIT), truncated: true }
    : { keys };
}

/**
 * A summary cut to SUMMARY_LIMIT: values go first (the changed paths stay), then facts, then paths.
 */
export function capSummary(summary: AuditSummary): AuditSummary {
  const safe: AuditSummary = {
    ...(summary.changes
      ? { changes: sanitize(summary.changes) as AuditChange[] }
      : {}),
    ...(summary.keys ? { keys: summary.keys.slice(0, PATHS_LIMIT) } : {}),
    ...(summary.data
      ? { data: sanitize(summary.data) as Record<string, unknown> }
      : {}),
    ...(summary.truncated ? { truncated: true } : {}),
  };
  if (JSON.stringify(safe).length <= SUMMARY_LIMIT) return safe;
  const keys = [
    ...(safe.keys ?? []),
    ...(safe.changes ?? []).map((c) => c.path),
  ].slice(0, PATHS_LIMIT);
  const smaller: AuditSummary = { keys, truncated: true };
  if (
    safe.data &&
    JSON.stringify({ ...smaller, data: safe.data }).length <= SUMMARY_LIMIT
  )
    smaller.data = safe.data;
  if (JSON.stringify(smaller).length <= SUMMARY_LIMIT) return smaller;
  return { keys: keys.slice(0, 20).map((k) => cut(k, 100)), truncated: true };
}

/** A request body as a summary: its (sanitized) fields as facts. */
export function bodySummary(body: unknown): AuditSummary {
  if (body === undefined || body === null) return {};
  if (isObject(body) && !Object.keys(body).length) return {};
  return { data: { body: sanitize(body) } };
}

// ---- CSV ---------------------------------------------------------------------------------------------

export const CSV_COLUMNS = [
  'at',
  'actor_email',
  'actor_roles',
  'section',
  'action',
  'target_type',
  'target_id',
  'country',
  'summary',
  'ip',
  'user_agent',
] as const;

/**
 * One CSV field: quoted when it holds a comma, quote or line break; a value a spreadsheet would run
 * as a formula (=, +, -, @, tab, CR first) gets a leading apostrophe.
 */
export function csvField(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The events as CSV (RFC 4180, CRLF line ends, a header row). */
export function toCsv(events: readonly AuditEvent[]): string {
  const rows = events.map((e) =>
    [
      e.at,
      e.actorEmail,
      e.actorRoles.join(' '),
      e.section,
      e.action,
      e.targetType,
      e.targetId,
      e.country,
      e.summary,
      e.ip,
      e.userAgent,
    ]
      .map(csvField)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
