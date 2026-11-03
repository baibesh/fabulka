import type { AuditEvent } from '@fabulka/shared';
import {
  OMITTED,
  REDACTED,
  SUMMARY_LIMIT,
  capSummary,
  csvField,
  diffSummary,
  sanitize,
  toCsv,
} from './audit';

describe('sanitize', () => {
  it('redacts secrets and leaves out book contents and the child', () => {
    expect(
      sanitize({
        email: 'a@e2e.test',
        password: 'hunter2',
        clientSecret: 'x',
        apiKey: 'k',
        nested: { accessToken: 't', Authorization: 'Bearer z', name: 'ok' },
        pages: [{ text: 'Once upon a time' }],
        child: { name: 'Aisha', age: 5 },
        talkQuestions: ['Why?'],
        image: 'data:image/png;base64,AAAA',
      }),
    ).toEqual({
      email: 'a@e2e.test',
      password: REDACTED,
      clientSecret: REDACTED,
      apiKey: REDACTED,
      nested: { accessToken: REDACTED, Authorization: REDACTED, name: 'ok' },
      pages: OMITTED,
      child: OMITTED,
      talkQuestions: OMITTED,
      image: OMITTED,
    });
  });

  it('cuts long strings and long arrays, and drops what JSON cannot hold', () => {
    const out = sanitize({
      text: 'x'.repeat(1000),
      list: Array.from({ length: 80 }, (_, i) => i),
      fn: () => 1,
      gone: undefined,
      at: new Date('2026-11-03T00:00:00Z'),
    }) as Record<string, unknown>;
    expect(out.text).toBe(`${'x'.repeat(200)}… (1000 chars)`);
    expect((out.list as unknown[]).length).toBe(51);
    expect((out.list as unknown[])[50]).toBe('… (80 items)');
    expect(out).not.toHaveProperty('fn');
    expect(out).not.toHaveProperty('gone');
    expect(out.at).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('diffSummary', () => {
  const prices = {
    books: {
      template: { KZT: 1900, USD: 3.9 },
      custom: { KZT: 2900, USD: 5.9 },
    },
    deliveryKzt: 1500,
  };

  it('keeps before and after of each changed value of a small object', () => {
    const after = {
      ...prices,
      books: { ...prices.books, template: { KZT: 2500, USD: 3.9 } },
    };
    expect(diffSummary(prices, after)).toEqual({
      changes: [{ path: 'books.template.KZT', before: 1900, after: 2500 }],
    });
  });

  it('names a changed item of a list by its id or code', () => {
    const before = [
      { code: 'KZ', print: true },
      { code: 'DE', print: false },
    ];
    const after = [
      { code: 'KZ', print: true },
      { code: 'DE', print: true },
      { code: 'ES', print: false },
    ];
    expect(diffSummary(before, after).changes).toEqual([
      { path: 'DE.print', before: false, after: true },
      { path: 'ES.code', after: 'ES' },
      { path: 'ES.print', after: false },
    ]);
  });

  it('compares a thing made or removed field by field', () => {
    expect(
      diffSummary(null, { name: 'X', rights: ['orders'] }).changes,
    ).toEqual([
      { path: 'name', after: 'X' },
      { path: 'rights', after: ['orders'] },
    ]);
    expect(diffSummary({ status: 'paid' }, null).changes).toEqual([
      { path: 'status', before: 'paid' },
    ]);
  });

  it('keeps only the changed paths of a big object', () => {
    const before = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, 'a'.repeat(150)]),
    );
    const after = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, 'b'.repeat(150)]),
    );
    const summary = diffSummary(before, after);
    expect(summary.changes).toBeUndefined();
    expect(summary.keys).toHaveLength(40);
    expect(summary.keys?.[0]).toBe('k0');
  });

  it('never stores a secret in a diff', () => {
    const summary = diffSummary({ password: 'old' }, { password: 'new' });
    expect(JSON.stringify(summary)).not.toMatch(/old|new/);
  });

  it('is empty when nothing changed', () => {
    expect(diffSummary(prices, structuredClone(prices))).toEqual({
      changes: [],
    });
  });
});

describe('capSummary', () => {
  it('keeps a small summary as it is', () => {
    const summary = { changes: [{ path: 'a', before: 1, after: 2 }] };
    expect(capSummary(summary)).toEqual(summary);
  });

  it('drops values first, then facts, to stay under the size cap', () => {
    const changes = Array.from({ length: 300 }, (_, i) => ({
      path: `field${i}`,
      before: 'x'.repeat(150),
      after: 'y'.repeat(150),
    }));
    const capped = capSummary({ changes, data: { note: 'kept' } });
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(SUMMARY_LIMIT);
    expect(capped.changes).toBeUndefined();
    expect(capped.truncated).toBe(true);
    expect(capped.keys?.[0]).toBe('field0');
    expect(capped.data).toEqual({ note: 'kept' });
  });

  it('redacts secrets that reach it through facts', () => {
    expect(capSummary({ data: { token: 'abc' } })).toEqual({
      data: { token: REDACTED },
    });
  });
});

describe('CSV', () => {
  const event = (over: Partial<AuditEvent> = {}): AuditEvent => ({
    id: 'e1',
    at: '2026-11-03T10:00:00.000Z',
    actorEmail: 'admin@e2e.test',
    actorStaffId: null,
    actorRoles: ['admin'],
    section: 'reference',
    action: 'prices.set',
    targetType: 'prices',
    targetId: 'DE',
    country: 'DE',
    summary: { changes: [{ path: 'deliveryKzt', before: 1500, after: 0 }] },
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Mac, "test")',
    ...over,
  });

  it('writes a header and one row per event, quoting what needs it', () => {
    const csv = toCsv([event()]);
    const [header, row, end] = csv.split('\r\n');
    expect(header).toBe(
      'at,actor_email,actor_roles,section,action,target_type,target_id,country,summary,ip,user_agent',
    );
    expect(row).toBe(
      '2026-11-03T10:00:00.000Z,admin@e2e.test,admin,reference,prices.set,prices,DE,DE,' +
        '"{""changes"":[{""path"":""deliveryKzt"",""before"":1500,""after"":0}]}",' +
        '127.0.0.1,"Mozilla/5.0 (Mac, ""test"")"',
    );
    expect(end).toBe('');
  });

  it('defuses values a spreadsheet would run as formulas', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField(null)).toBe('');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });
});
