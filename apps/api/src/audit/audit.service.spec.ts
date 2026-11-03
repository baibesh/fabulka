import {
  AuditQuerySchema,
  BUILTIN_ROLES,
  SUPER_ROLE,
  accessOf,
} from '@fabulka/shared';
import type { AuditEvent as Row } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditService, CSV_LIMIT } from './audit.service';

const SUPER = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);
const DE = accessOf(['country_manager'], BUILTIN_ROLES, ['DE']);
const DE_AT = accessOf(['country_manager'], BUILTIN_ROLES, ['DE', 'AT']);
const SEO = accessOf(['seo'], BUILTIN_ROLES, []);

const query = (input: Record<string, unknown> = {}) =>
  AuditQuerySchema.parse(input);

const row = (i: number, over: Partial<Row> = {}): Row => ({
  id: `e${String(i).padStart(3, '0')}`,
  at: new Date(Date.UTC(2026, 10, 3, 12, 0, 0) - i * 1000),
  actorStaffId: null,
  actorEmail: 'admin@e2e.test',
  actorRoles: ['admin'],
  section: 'reference',
  action: 'prices.set',
  targetType: 'prices',
  targetId: 'DE',
  country: 'DE',
  summary: {},
  ip: null,
  userAgent: null,
  ...over,
});

function setup(rows: Row[] = []) {
  const findMany = jest.fn((args: { take?: number }) =>
    Promise.resolve(rows.slice(0, args.take ?? rows.length)),
  );
  const create = jest.fn<Promise<unknown>, [{ data: Record<string, unknown> }]>(
    () => Promise.resolve({}),
  );
  const deleteMany = jest.fn<
    Promise<{ count: number }>,
    [{ where: { at: { lt: Date } } }]
  >(() => Promise.resolve({ count: 3 }));
  const prisma = { auditEvent: { findMany, create, deleteMany } };
  return {
    service: new AuditService(prisma as unknown as PrismaService),
    findMany,
    create,
    deleteMany,
  };
}

describe('AuditService.where: who sees which events', () => {
  it('shows the superadmin every event, narrowed by the working country when asked', () => {
    const { service } = setup();
    expect(service.where(SUPER, query())).toEqual({});
    expect(service.where(SUPER, query({ country: 'kz' }))).toEqual({
      AND: [{ country: { in: ['KZ'] } }],
    });
  });

  it("shows a country manager only their countries' events, never global ones", () => {
    const { service } = setup();
    expect(service.where(DE_AT, query())).toEqual({
      AND: [{ country: { in: ['DE', 'AT'] } }],
    });
    expect(service.where(DE, query({ country: 'DE' }))).toEqual({
      AND: [{ country: { in: ['DE'] } }],
    });
    // Another country, even asked for by name, shows nothing.
    expect(service.where(DE, query({ country: 'KZ' }))).toEqual({
      AND: [{ country: { in: [] } }],
    });
  });

  it('shows nothing to a session without the right', () => {
    const { service } = setup();
    expect(service.where(SEO, query())).toEqual({
      AND: [{ country: { in: [] } }],
    });
  });

  it('filters by person, section, days (UTC, inclusive) and text', () => {
    const { service } = setup();
    expect(
      service.where(
        SUPER,
        query({
          actor: 'Anna@E2E.test',
          section: 'reference',
          from: '2026-11-01',
          to: '2026-11-03',
          q: 'prices',
        }),
      ),
    ).toEqual({
      AND: [
        { actorEmail: 'anna@e2e.test' },
        { section: 'reference' },
        { at: { gte: new Date('2026-11-01T00:00:00Z') } },
        { at: { lt: new Date('2026-11-04T00:00:00Z') } },
        {
          OR: [
            { actorEmail: { contains: 'prices', mode: 'insensitive' } },
            { action: { contains: 'prices', mode: 'insensitive' } },
            { targetType: { contains: 'prices', mode: 'insensitive' } },
            { targetId: { contains: 'prices', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });
});

describe('AuditService.list', () => {
  it('pages newest first and continues after the cursor', async () => {
    const rows = [row(1), row(2), row(3)];
    const { service, findMany } = setup(rows);
    const page = await service.list(DE, query({ limit: 2 }));
    expect(page.events.map((e) => e.id)).toEqual(['e001', 'e002']);
    expect(page.nextCursor).toBe(`${rows[1].at.toISOString()}_e002`);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ country: { in: ['DE'] } }] },
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );

    await service.list(DE, query({ limit: 2, cursor: page.nextCursor! }));
    expect(findMany.mock.calls[1][0]).toMatchObject({
      where: {
        AND: [
          { AND: [{ country: { in: ['DE'] } }] },
          {
            OR: [
              { at: { lt: rows[1].at } },
              { at: rows[1].at, id: { lt: 'e002' } },
            ],
          },
        ],
      },
    });
  });

  it('ends without a cursor on the last page', async () => {
    const { service } = setup([row(1)]);
    expect((await service.list(SUPER, query())).nextCursor).toBeNull();
  });
});

describe('AuditService.record', () => {
  it('stores the actor, an upper-case country and a capped, redacted summary', async () => {
    const { service, create } = setup();
    service.record({
      actor: {
        who: 'Anna@E2E.test',
        staffId: 's1',
        roles: ['country_manager'],
      },
      section: 'reference',
      action: 'prices.set',
      targetType: 'prices',
      targetId: 'DE',
      country: 'de',
      summary: { data: { body: { password: 'x', deliveryKzt: 0 } } },
      ip: '10.0.0.1',
      userAgent: 'u'.repeat(1000),
    });
    await service.idle();
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      actorEmail: 'anna@e2e.test',
      actorStaffId: 's1',
      actorRoles: ['country_manager'],
      country: 'DE',
      summary: { data: { body: { password: '[redacted]', deliveryKzt: 0 } } },
    });
    expect((data.userAgent as string).length).toBeLessThan(330);
  });

  it('never throws when the database refuses', async () => {
    const { service, create } = setup();
    create.mockRejectedValueOnce(new Error('down'));
    expect(() =>
      service.record({
        actor: { who: null, staffId: null, roles: [] },
        section: 'team',
        action: 'other',
      }),
    ).not.toThrow();
    await expect(service.idle()).resolves.toBeUndefined();
  });
});

describe('AuditService.csv and prune', () => {
  it('exports every page of the filtered list, up to the limit', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
    const { service, findMany } = setup(rows);
    const csv = await service.csv(DE, query());
    expect(csv.trim().split('\r\n')).toHaveLength(6);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { AND: [{ country: { in: ['DE'] } }] },
    });
    expect(CSV_LIMIT).toBeGreaterThanOrEqual(10_000);
  });

  it('deletes events older than the retention, keeping a year', async () => {
    const { service, deleteMany } = setup();
    const now = new Date('2026-11-03T00:00:00Z');
    expect(await service.prune(now)).toBe(3);
    const cutoff = deleteMany.mock.calls[0][0].where.at.lt;
    expect(now.getTime() - cutoff.getTime()).toBeGreaterThanOrEqual(
      365 * 24 * 60 * 60 * 1000,
    );
  });
});
