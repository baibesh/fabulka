import { BUILTIN_ROLES } from '@fabulka/shared';
import type { StaffMember, StaffRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Where clauses the staff code uses, matched in memory. */
type Where = Record<string, unknown> | undefined;

function matches(row: Record<string, unknown>, where: Where): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (
      condition &&
      typeof condition === 'object' &&
      !Array.isArray(condition)
    ) {
      const c = condition as { has?: unknown; not?: unknown; in?: unknown[] };
      if ('has' in c) return Array.isArray(value) && value.includes(c.has);
      if ('not' in c) return value !== c.not;
      if ('in' in c) return c.in!.includes(value);
    }
    return value === condition;
  });
}

function table<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  make: (data: Partial<T>) => T,
) {
  const find = (where: Where) => rows.find((r) => matches(r, where)) ?? null;
  return {
    rows,
    findUnique: jest.fn(({ where }: { where: Where }) =>
      Promise.resolve(find(where)),
    ),
    findMany: jest.fn((args: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((r) => matches(r, args.where))),
    ),
    count: jest.fn(({ where }: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((r) => matches(r, where)).length),
    ),
    create: jest.fn(({ data }: { data: Partial<T> }) => {
      if (rows.some((r) => r[key] === data[key])) {
        return Promise.reject(new Error('unique'));
      }
      const row = make(data);
      rows.push(row);
      return Promise.resolve(row);
    }),
    update: jest.fn(({ where, data }: { where: Where; data: Partial<T> }) => {
      const row = find(where);
      if (!row) return Promise.reject(new Error('not found'));
      Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    }),
    upsert: jest.fn(
      ({
        where,
        create,
        update,
      }: {
        where: Where;
        create: Partial<T>;
        update: Partial<T>;
      }) => {
        const row = find(where);
        if (row) return Promise.resolve(Object.assign(row, update));
        const made = make(create);
        rows.push(made);
        return Promise.resolve(made);
      },
    ),
    delete: jest.fn(({ where }: { where: Where }) => {
      const index = rows.findIndex((r) => matches(r, where));
      return Promise.resolve(rows.splice(index, 1)[0]);
    }),
  };
}

let ids = 0;

/** A staff row with defaults. */
export function staffRow(data: Partial<StaffMember> = {}): StaffMember {
  return {
    id: `staff-${++ids}`,
    email: 'someone@example.com',
    keycloakId: null,
    name: '',
    status: 'active',
    roles: [],
    countries: [],
    realmRoles: [],
    lastLoginAt: null,
    createdBy: null,
    capUsd: null,
    uncapped: false,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...data,
  };
}

/** The roles table as the migration seeds it. */
export function seededRoles(): StaffRole[] {
  return BUILTIN_ROLES.map((role, i) => ({
    key: role.key,
    name: role.name,
    rights: [...role.rights],
    scoped: role.scoped,
    locked: role.locked,
    createdAt: new Date(2026, 10, 1, 0, 0, i),
    updatedAt: new Date(2026, 10, 1),
  }));
}

/** An in-memory StaffMember and StaffRole for the staff services. */
export function fakeStaffPrisma(
  staff: StaffMember[] = [],
  roles: StaffRole[] = seededRoles(),
) {
  const prisma = {
    staffMember: table<StaffMember & Record<string, unknown>>(
      staff,
      'email',
      (data) => staffRow(data),
    ),
    staffRole: table<StaffRole & Record<string, unknown>>(
      roles,
      'key',
      (data) => ({
        key: '',
        name: '',
        rights: [],
        scoped: false,
        locked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    ),
  };
  return {
    prisma,
    service: prisma as unknown as PrismaService,
  };
}
