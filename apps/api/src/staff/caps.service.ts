import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  NO_STAFF_CAPS,
  STAFF_CAP_REACHED,
  StaffCapDefaultsSchema,
  budgetOf,
  isSuperAdmin,
  personCap,
  type CountrySpend,
  type StaffBudget,
  type StaffCapDefaults,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay } from '../quota/quota.service';

/** Where the superadmin's defaults live (Setting). */
export const CAPS_KEY = 'staff.caps';

/** Who is acting: their email, staff row (when they have one) and roles. */
export interface StaffIdentity {
  who?: string | null;
  staffId?: string | null;
  roles: string[];
}

/** Who a staff action is for, as the journal records it on each model call. */
export interface StaffSpendContext {
  staffEmail: string | null;
  staffCountry: string | null;
}

/**
 * Daily caps on what staff actions spend on paid models (example translations, theme proposals):
 * per person and per country, in dollars, summed from today's (UTC) model calls the journal
 * recorded against a staff email or country. The defaults are a Setting; a person's own cap or
 * "uncapped" is on their staff row. Superadmins are uncapped unless given a cap of their own.
 */
@Injectable()
export class StaffCapsService {
  constructor(private readonly prisma: PrismaService) {}

  async defaults(): Promise<StaffCapDefaults> {
    const row = await this.prisma.setting.findUnique({
      where: { key: CAPS_KEY },
    });
    const parsed = StaffCapDefaultsSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : NO_STAFF_CAPS;
  }

  async setDefaults(defaults: StaffCapDefaults): Promise<StaffCapDefaults> {
    const value = defaults as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({
      where: { key: CAPS_KEY },
      create: { key: CAPS_KEY, value },
      update: { value },
    });
    return defaults;
  }

  /** Someone's staff spend today, in dollars. */
  async spentToday(email: string | null): Promise<number> {
    if (!email) return 0;
    const sum = await this.prisma.modelCall.aggregate({
      where: {
        staffEmail: email.toLowerCase(),
        createdAt: { gte: startOfDay() },
      },
      _sum: { costUsd: true },
    });
    return round(sum._sum.costUsd ?? 0);
  }

  /** A country's staff spend today, in dollars. */
  async countrySpentToday(country: string): Promise<number> {
    const sum = await this.prisma.modelCall.aggregate({
      where: { staffCountry: country, createdAt: { gte: startOfDay() } },
      _sum: { costUsd: true },
    });
    return round(sum._sum.costUsd ?? 0);
  }

  /** Staff spend today by email (lower-cased). */
  async spendByPerson(): Promise<Map<string, number>> {
    const rows = await this.prisma.modelCall.groupBy({
      by: ['staffEmail'],
      where: { staffEmail: { not: null }, createdAt: { gte: startOfDay() } },
      _sum: { costUsd: true },
    });
    return new Map(
      rows.map((r) => [r.staffEmail!, round(r._sum.costUsd ?? 0)]),
    );
  }

  /**
   * Staff spend today by country with each country's cap: every country with spend, limited to
   * `countries` when given (a manager's dashboard, which also lists theirs without spend).
   */
  async spendByCountry(countries: string[] | null): Promise<CountrySpend[]> {
    const [rows, defaults] = await Promise.all([
      this.prisma.modelCall.groupBy({
        by: ['staffCountry'],
        where: {
          createdAt: { gte: startOfDay() },
          ...(countries
            ? { staffCountry: { in: countries } }
            : {
                OR: [
                  { staffCountry: { not: null } },
                  { staffEmail: { not: null } },
                ],
              }),
        },
        _sum: { costUsd: true },
      }),
      this.defaults(),
    ]);
    const spend = new Map(
      rows.map((r) => [r.staffCountry, round(r._sum.costUsd ?? 0)]),
    );
    for (const code of countries ?? [])
      if (!spend.has(code)) spend.set(code, 0);
    return [...spend.entries()]
      .map(([country, usd]) => ({
        country,
        usd,
        capUsd: country ? defaults.countryUsd : null,
      }))
      .sort(
        (a, b) =>
          b.usd - a.usd || String(a.country).localeCompare(String(b.country)),
      );
  }

  /** What the session may still spend today on an action for `country` (null: no country). */
  async budget(
    session: StaffIdentity,
    country: string | null,
  ): Promise<StaffBudget> {
    const email = session.who?.toLowerCase() ?? null;
    const [row, defaults, personSpent, countrySpent] = await Promise.all([
      session.staffId
        ? this.prisma.staffMember.findUnique({ where: { id: session.staffId } })
        : email
          ? this.prisma.staffMember.findUnique({ where: { email } })
          : null,
      this.defaults(),
      this.spentToday(email),
      country ? this.countrySpentToday(country) : 0,
    ]);
    const superadmin = isSuperAdmin(session);
    const member = row ? { capUsd: row.capUsd, uncapped: row.uncapped } : null;
    // Uncapped people (marked so, or a superadmin without a cap of their own) skip the country's cap.
    const exempt = member?.uncapped || (superadmin && member?.capUsd == null);
    return budgetOf({
      personCapUsd: personCap(member, superadmin, defaults),
      personSpentUsd: personSpent,
      country,
      countryCapUsd: exempt ? null : defaults.countryUsd,
      countrySpentUsd: countrySpent,
    });
  }

  /**
   * Refuses (429 staff_cap_reached, with the budget) when the session has nothing left today for
   * an action for `country`; returns the budget otherwise.
   */
  async assert(
    session: StaffIdentity,
    country: string | null,
  ): Promise<StaffBudget> {
    const budget = await this.budget(session, country);
    if (!budget.allowed) {
      throw new HttpException(
        {
          code: STAFF_CAP_REACHED,
          message: 'The daily generation budget is spent',
          budget,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return budget;
  }

  /** What the journal records on the model calls of a session's action for `country`. */
  static context(
    session: Pick<StaffIdentity, 'who'>,
    country: string | null,
  ): StaffSpendContext {
    return {
      staffEmail: session.who?.toLowerCase() ?? null,
      staffCountry: country,
    };
  }
}

function round(usd: number): number {
  return Math.round(usd * 10_000) / 10_000;
}
