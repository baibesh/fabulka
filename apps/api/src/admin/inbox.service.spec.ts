import type { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import {
  BUILTIN_ROLES,
  DEFAULT_COUNTRIES,
  SUPER_ROLE,
  accessOf,
  type CountryOverview,
} from '@fabulka/shared';
import type { ExamplesService } from '../examples/examples.service';
import type { OrdersService } from '../orders/orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../quota/quota.service';
import type { ReferenceService } from '../reference/reference.service';
import type { SeoService } from '../seo/seo.service';
import type { SettingsService } from '../settings/settings.service';
import type { StaffCapsService } from '../staff/caps.service';
import { InboxService } from './inbox.service';

const SUPER = accessOf([SUPER_ROLE], BUILTIN_ROLES, []);
const DE = accessOf(['country_manager'], BUILTIN_ROLES, ['DE']);
const ILLUSTRATOR = accessOf(['illustrator'], BUILTIN_ROLES, []);
const SEO = accessOf(['seo'], BUILTIN_ROLES, []);

/** A country overview row with these gaps. */
const overviewRow = (
  country: string,
  gaps: CountryOverview['gaps'],
): CountryOverview => ({
  country,
  listed: true,
  languages: ['de', 'en'],
  currency: 'EUR',
  print: false,
  prices: { template: null, custom: null, own: false },
  localExamples: 0,
  countrySamples: 0,
  byLanguage: [],
  gaps,
});

function setup(
  overrides: {
    paused?: boolean;
    failed?: number;
    flags?: number;
    spendUsd?: number;
    drafts?: Record<string, number>;
    stages?: Record<string, number>;
  } = {},
) {
  const prisma = {
    book: {
      count: jest.fn(() => Promise.resolve(overrides.failed ?? 0)),
      findMany: jest.fn(() =>
        Promise.resolve(
          overrides.failed
            ? [{ id: 'b1', title: null, child: { name: 'Mia' } }]
            : [],
        ),
      ),
      aggregate: jest.fn(() =>
        Promise.resolve({ _sum: { costUsd: overrides.spendUsd ?? 0 } }),
      ),
    },
    pageFlag: {
      count: jest.fn(() => Promise.resolve(overrides.flags ?? 0)),
      findMany: jest.fn(() =>
        Promise.resolve(
          overrides.flags
            ? [
                {
                  id: 'f1',
                  page: 'story-2',
                  bookId: 'b9',
                  book: { title: 'Sea' },
                },
              ]
            : [],
        ),
      ),
    },
    order: { findMany: jest.fn(() => Promise.resolve([])) },
    $queryRaw: jest.fn(() => Promise.resolve([])),
  };
  const examples = {
    overview: jest.fn((_session: unknown, only?: string | null) =>
      Promise.resolve(
        only === 'DE'
          ? [
              overviewRow('DE', [
                { code: 'no_landing_image' },
                { code: 'no_examples', language: 'de' },
                { code: 'not_offered' },
              ]),
            ]
          : [],
      ),
    ),
  };
  const orders = {
    openStages: jest.fn(() => Promise.resolve(overrides.stages ?? {})),
  };
  const seo = {
    pendingCounts: jest.fn(() => Promise.resolve(overrides.drafts ?? {})),
  };
  const caps = {
    spendByCountry: jest.fn((countries: string[] | null) =>
      Promise.resolve(
        (countries ?? ['DE', 'KZ']).map((country) => ({
          country,
          usd: country === 'DE' ? 0.9 : 0.1,
          capUsd: 1,
        })),
      ),
    ),
  };
  const service = new InboxService(
    prisma as unknown as PrismaService,
    {
      paused: () => Promise.resolve(overrides.paused ?? false),
    } as unknown as SettingsService,
    {
      caps: () =>
        Promise.resolve({
          regular: { used: 10, limit: 100 },
          demo: { used: 19, limit: 20 },
        }),
    } as unknown as QuotaService,
    caps as unknown as StaffCapsService,
    seo as unknown as SeoService,
    examples as unknown as ExamplesService,
    {
      countries: () => Promise.resolve(DEFAULT_COUNTRIES),
    } as unknown as ReferenceService,
    orders as unknown as OrdersService,
    { get: () => 150 } as unknown as ConfigService,
  );
  return { service, prisma, examples, orders, seo, caps };
}

describe('InboxService.inbox (global)', () => {
  it('gives the superadmin every global row, most urgent first, each with its fix', async () => {
    const { service } = setup({
      paused: true,
      failed: 2,
      flags: 1,
      spendUsd: 130,
      drafts: { en: 2, de: 0 },
      stages: { paid: 1, printing: 2 },
    });
    const { country, items } = await service.inbox(SUPER, null);
    expect(country).toBeNull();
    const kinds = items.map((item) => item.kind);
    expect(kinds.slice(0, 2)).toEqual(['generation_paused', 'failed_books']);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'orders_waiting',
        'spend_budget',
        'daily_cap',
        'staff_spend',
        'page_flags',
        'seo_drafts',
      ]),
    );
    const byKind = Object.fromEntries(items.map((item) => [item.kind, item]));
    expect(byKind.generation_paused.href).toBe(
      '/admin/settings?tab=generation',
    );
    expect(byKind.failed_books).toMatchObject({
      count: 2,
      href: '/admin/books?status=failed',
      samples: [{ id: 'b1', label: 'Mia', href: '/admin/books/b1' }],
    });
    expect(byKind.orders_waiting).toMatchObject({
      count: 3,
      href: '/admin/orders?status=open',
    });
    expect(byKind.spend_budget).toMatchObject({
      count: 87,
      severity: 'warning',
    });
    // Only the demo cap is near its limit; only Germany's staff spend is near its cap.
    expect(items.filter((i) => i.kind === 'daily_cap')).toHaveLength(1);
    expect(byKind.daily_cap.detail).toMatchObject({ cap: 'demo' });
    expect(items.filter((i) => i.kind === 'staff_spend')).toEqual([
      expect.objectContaining({
        country: 'DE',
        href: '/admin/settings?tab=caps',
      }),
    ]);
    expect(byKind.page_flags.href).toBe('/admin/references?tab=flags');
    // A language without drafts has no row.
    expect(items.filter((i) => i.kind === 'seo_drafts')).toEqual([
      expect.objectContaining({
        language: 'en',
        count: 2,
        href: '/admin/seo?version=en',
      }),
    ]);
  });

  it('is empty when nothing waits', async () => {
    const { service } = setup();
    const { items } = await service.inbox(SEO, null);
    expect(items).toEqual([]);
  });

  it('shows an illustrator only flagged pages, and SEO staff only drafts', async () => {
    const { service, orders, seo } = setup({
      paused: true,
      failed: 1,
      flags: 2,
      drafts: { de: 1 },
      stages: { paid: 4 },
    });
    const illustrator = await service.inbox(ILLUSTRATOR, null);
    expect(illustrator.items.map((i) => i.kind).sort()).toEqual([
      'failed_books',
      'page_flags',
    ]);
    const seoItems = await service.inbox(SEO, null);
    expect(seoItems.items.map((i) => i.kind)).toEqual(['seo_drafts']);
    // Neither asked for orders; only SEO staff asked for drafts.
    expect(orders.openStages).not.toHaveBeenCalled();
    expect(seo.pendingCounts).toHaveBeenCalledTimes(1);
  });
});

describe('InboxService.inbox (country)', () => {
  it("lists a country manager's gaps with their fixes, the new orders and its spend", async () => {
    const { service, examples, orders, caps } = setup({
      paused: true,
      stages: { paid: 2, shipped: 1 },
      drafts: { de: 3 },
    });
    const { country, items } = await service.inbox(DE, 'DE');
    expect(country).toBe('DE');
    expect(examples.overview).toHaveBeenCalledWith(DE, 'DE');
    expect(orders.openStages).toHaveBeenCalledWith(['DE']);
    expect(caps.spendByCountry).toHaveBeenCalledWith(['DE']);
    const gaps = items.filter((i) => i.kind === 'gap');
    expect(gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gap: 'no_landing_image',
          href: '/admin/landing',
        }),
        expect.objectContaining({
          gap: 'no_examples',
          language: 'de',
          href: '/admin/examples',
        }),
        // The countries list is global staff's: the manager sees the gap but cannot fix it here.
        expect.objectContaining({ gap: 'not_offered', href: null }),
      ]),
    );
    expect(items.find((i) => i.kind === 'new_orders')).toMatchObject({
      count: 2,
      href: '/admin/orders?status=paid',
    });
    expect(items.find((i) => i.kind === 'orders_waiting')).toMatchObject({
      count: 1,
      severity: 'info',
    });
    // The pause is shown, but its switch is global staff's.
    expect(items[0]).toMatchObject({ kind: 'generation_paused', href: null });
    expect(items.find((i) => i.kind === 'staff_spend')).toMatchObject({
      country: 'DE',
      href: '/admin/overview',
    });
    // No global rows: SEO drafts and failed books are not the manager's.
    expect(
      items.some((i) => i.kind === 'seo_drafts' || i.kind === 'failed_books'),
    ).toBe(false);
  });

  it('refuses a country manager another country', async () => {
    const { service } = setup();
    await expect(service.inbox(DE, 'KZ')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("gives the superadmin a country's drafts in its languages only, and global fixes", async () => {
    const { service } = setup({ drafts: { de: 1, kk: 5, en: 2 } });
    const { items } = await service.inbox(SUPER, 'DE');
    expect(
      items
        .filter((i) => i.kind === 'seo_drafts')
        .map((i) => i.language)
        .sort(),
    ).toEqual(['de', 'en']);
    expect(items.find((i) => i.gap === 'not_offered')?.href).toBe(
      '/admin/settings?tab=countries',
    );
    expect(items.find((i) => i.kind === 'staff_spend')?.href).toBe(
      '/admin/settings?tab=caps',
    );
  });
});

describe('InboxService.search', () => {
  it('needs two characters', async () => {
    const { service, prisma } = setup();
    expect(await service.search(SUPER, ' a ')).toEqual({
      books: [],
      orders: [],
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("searches a country manager's orders in their countries only, and no books", async () => {
    const { service, prisma } = setup();
    await service.search(DE, 'cm1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { startsWith: 'cm1', mode: 'insensitive' },
          country: { in: ['DE'] },
        },
      }),
    );
  });

  it('does not search orders for staff without them', async () => {
    const { service, prisma } = setup();
    await service.search(ILLUSTRATOR, 'mia');
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
