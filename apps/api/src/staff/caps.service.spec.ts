import { HttpException } from '@nestjs/common';
import {
  BUILTIN_ROLES,
  STAFF_CAP_REACHED,
  SUPER_ROLE,
  accessOf,
  type StaffCapDefaults,
} from '@fabulka/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { CAPS_KEY, StaffCapsService } from './caps.service';
import { staffRow } from './staff.testing';

interface Call {
  staffEmail: string | null;
  staffCountry: string | null;
  costUsd: number;
}

/** Today's model calls and the staff rows, matched in memory as the service asks. */
function setup(
  calls: Call[],
  defaults: StaffCapDefaults | null,
  rows = [
    staffRow({
      id: 'cm',
      email: 'cm@e2e.test',
      roles: ['country_manager'],
      countries: ['DE'],
    }),
  ],
) {
  const sum = (where: { staffEmail?: string; staffCountry?: string }) =>
    calls
      .filter(
        (c) =>
          (where.staffEmail === undefined ||
            c.staffEmail === where.staffEmail) &&
          (where.staffCountry === undefined ||
            c.staffCountry === where.staffCountry),
      )
      .reduce((total, c) => total + c.costUsd, 0);
  const prisma = {
    setting: {
      findUnique: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === CAPS_KEY && defaults
            ? { key: CAPS_KEY, value: defaults }
            : null,
        ),
      ),
      upsert: jest.fn().mockResolvedValue({}),
    },
    modelCall: {
      aggregate: jest.fn(
        ({
          where,
        }: {
          where: { staffEmail?: string; staffCountry?: string };
        }) => Promise.resolve({ _sum: { costUsd: sum(where) } }),
      ),
      groupBy: jest.fn(({ by }: { by: ['staffEmail' | 'staffCountry'] }) => {
        const totals = new Map<string | null, number>();
        for (const c of calls)
          totals.set(c[by[0]], (totals.get(c[by[0]]) ?? 0) + c.costUsd);
        return Promise.resolve(
          [...totals].map(([key, costUsd]) => ({
            [by[0]]: key,
            _sum: { costUsd },
          })),
        );
      }),
    },
    staffMember: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; email?: string } }) =>
          Promise.resolve(
            rows.find((r) => r.id === where.id || r.email === where.email) ??
              null,
          ),
      ),
    },
  };
  return new StaffCapsService(prisma as unknown as PrismaService);
}

const manager = {
  ...accessOf(['country_manager'], BUILTIN_ROLES, ['DE']),
  who: 'cm@e2e.test',
  staffId: 'cm',
};
const owner = {
  ...accessOf([SUPER_ROLE], BUILTIN_ROLES, []),
  who: 'owner@e2e.test',
  staffId: null,
};

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpException) => ({
      status: error.getStatus(),
      body: error.getResponse() as {
        code: string;
        budget: { remainingUsd: number };
      },
    }),
  );

describe('StaffCapsService', () => {
  it('has no caps until the superadmin sets defaults', async () => {
    const caps = setup(
      [{ staffEmail: 'cm@e2e.test', staffCountry: 'DE', costUsd: 50 }],
      null,
    );
    const budget = await caps.budget(manager, 'DE');
    expect(budget).toMatchObject({ remainingUsd: null, allowed: true });
    expect(budget.person.spentUsd).toBe(50);
  });

  it("counts a person's and a country's spend today against the defaults", async () => {
    const caps = setup(
      [
        { staffEmail: 'cm@e2e.test', staffCountry: 'DE', costUsd: 0.3 },
        { staffEmail: 'other@e2e.test', staffCountry: 'DE', costUsd: 0.5 },
        { staffEmail: 'cm@e2e.test', staffCountry: null, costUsd: 0.1 },
      ],
      { personUsd: 1, countryUsd: 1 },
    );
    const budget = await caps.budget(manager, 'DE');
    expect(budget.person).toEqual({
      capUsd: 1,
      spentUsd: 0.4,
      remainingUsd: 0.6,
    });
    expect(budget.country).toEqual({
      code: 'DE',
      capUsd: 1,
      spentUsd: 0.8,
      remainingUsd: 0.2,
    });
    expect(budget.remainingUsd).toBe(0.2);
    expect(budget.allowed).toBe(true);
  });

  it('refuses with staff_cap_reached and the budget once a cap is spent', async () => {
    const caps = setup(
      [{ staffEmail: 'cm@e2e.test', staffCountry: 'DE', costUsd: 0.01 }],
      { personUsd: 0.01, countryUsd: null },
    );
    const refused = await refusal(caps.assert(manager, 'DE'));
    expect(refused?.status).toBe(429);
    expect(refused?.body.code).toBe(STAFF_CAP_REACHED);
    expect(refused?.body.budget.remainingUsd).toBe(0);
  });

  it("refuses on the country's cap even with the person's left", async () => {
    const caps = setup(
      [{ staffEmail: 'other@e2e.test', staffCountry: 'DE', costUsd: 2 }],
      { personUsd: 5, countryUsd: 2 },
    );
    expect((await refusal(caps.assert(manager, 'DE')))?.body.code).toBe(
      STAFF_CAP_REACHED,
    );
    // An action for another country is not held by Germany's.
    expect(await refusal(caps.assert(manager, 'AT'))).toBeNull();
  });

  it("uses a person's own cap over the default, and none when they are uncapped", async () => {
    const spent = [
      { staffEmail: 'cm@e2e.test', staffCountry: 'DE', costUsd: 3 },
    ];
    const own = setup(spent, { personUsd: 1, countryUsd: 10 }, [
      staffRow({ id: 'cm', email: 'cm@e2e.test', capUsd: 5 }),
    ]);
    expect((await own.budget(manager, 'DE')).person).toMatchObject({
      capUsd: 5,
      remainingUsd: 2,
    });
    const free = setup(spent, { personUsd: 1, countryUsd: 1 }, [
      staffRow({ id: 'cm', email: 'cm@e2e.test', uncapped: true }),
    ]);
    expect(await free.budget(manager, 'DE')).toMatchObject({
      remainingUsd: null,
      allowed: true,
    });
  });

  it('leaves a superadmin uncapped by default, their spend still counted for the country', async () => {
    const caps = setup(
      [{ staffEmail: 'owner@e2e.test', staffCountry: 'DE', costUsd: 9 }],
      { personUsd: 1, countryUsd: 1 },
      [],
    );
    const budget = await caps.budget(owner, 'DE');
    expect(budget).toMatchObject({ remainingUsd: null, allowed: true });
    expect(budget.country?.spentUsd).toBe(9);
    // …which holds the country's managers back.
    expect((await refusal(caps.assert(manager, 'DE')))?.body.code).toBe(
      STAFF_CAP_REACHED,
    );
  });

  it('lists staff spend by country with each cap, a manager seeing theirs even without spend', async () => {
    const caps = setup(
      [
        { staffEmail: 'cm@e2e.test', staffCountry: 'DE', costUsd: 0.4 },
        { staffEmail: 'owner@e2e.test', staffCountry: null, costUsd: 0.1 },
      ],
      { personUsd: null, countryUsd: 2 },
    );
    expect(await caps.spendByCountry(null)).toEqual([
      { country: 'DE', usd: 0.4, capUsd: 2 },
      { country: null, usd: 0.1, capUsd: null },
    ]);
    expect(await caps.spendByPerson()).toEqual(
      new Map([
        ['cm@e2e.test', 0.4],
        ['owner@e2e.test', 0.1],
      ]),
    );
  });

  it('records the staff email lower-cased and the country on model calls', () => {
    expect(StaffCapsService.context({ who: 'CM@E2E.test' }, 'DE')).toEqual({
      staffEmail: 'cm@e2e.test',
      staffCountry: 'DE',
    });
  });
});
