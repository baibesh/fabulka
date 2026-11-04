import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  NEAR_LIMIT,
  allowedFor,
  countryInfo,
  sortInbox,
  type AdminAccess,
  type AdminRight,
  type AdminSearch,
  type ChildProfile,
  type Inbox,
  type InboxItem,
  type InboxSeverity,
  type Language,
  type OverviewGap,
} from '@fabulka/shared';
import { ExamplesService } from '../examples/examples.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { ReferenceService } from '../reference/reference.service';
import { SeoService } from '../seo/seo.service';
import { SettingsService } from '../settings/settings.service';
import { StaffCapsService } from '../staff/caps.service';
import { listScope, outOfScope } from './scope';

/** How far back failed books count in the Inbox. */
export const FAILED_DAYS = 7;

/** Where each gap of the country overview is fixed, and the right that page needs. */
export const GAP_FIX: Record<
  OverviewGap,
  { href: string; right: AdminRight; severity: InboxSeverity }
> = {
  not_offered: {
    href: '/admin/settings?tab=countries',
    right: 'reference',
    severity: 'warning',
  },
  no_examples: {
    href: '/admin/examples',
    right: 'examples',
    severity: 'warning',
  },
  no_local_examples: {
    href: '/admin/examples',
    right: 'examples',
    severity: 'info',
  },
  missing_samples: {
    href: '/admin/catalog',
    right: 'catalog',
    severity: 'warning',
  },
  no_country_samples: {
    href: '/admin/catalog',
    right: 'catalog',
    severity: 'info',
  },
  no_landing_image: {
    href: '/admin/landing',
    right: 'reference.landing',
    severity: 'info',
  },
  no_landing_title: {
    href: '/admin/landing',
    right: 'reference.landing',
    severity: 'info',
  },
};

/** A share of a limit in whole percent (0 when there is no limit). */
const percent = (used: number, limit: number) =>
  limit > 0 ? Math.round((used / limit) * 100) : 0;

/** Near or over a limit: warning from 80%, danger once reached. */
const nearLimit = (used: number, limit: number): InboxSeverity | null =>
  limit > 0 && used >= limit
    ? 'danger'
    : limit > 0 && used >= limit * NEAR_LIMIT
      ? 'warning'
      : null;

/** `%`, `_` and `\` taken literally in an ILIKE pattern. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * The admin's Inbox: what waits for someone in the global workspace or in one country's, each row
 * with the page that fixes it. Every source is a count or a short list, and each is asked only when
 * the session holds the right that opens it (in that country, for a country workspace): a country
 * manager never sees another country's rows, an illustrator only flagged pages, SEO only drafts.
 * Also the command palette's search of books and orders.
 */
@Injectable()
export class InboxService {
  private readonly budgetUsd: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
    private readonly caps: StaffCapsService,
    private readonly seo: SeoService,
    private readonly examples: ExamplesService,
    private readonly reference: ReferenceService,
    private readonly orders: OrdersService,
    config: ConfigService,
  ) {
    this.budgetUsd = Number(config.get('MODEL_BUDGET_USD', 150));
  }

  /** The global workspace's Inbox (country null) or one country's; 403 for a country not the session's. */
  async inbox(session: AdminAccess, country: string | null): Promise<Inbox> {
    const items = country
      ? await this.countryItems(session, country)
      : await this.globalItems(session);
    return { country, items: sortInbox(items) };
  }

  private async globalItems(session: AdminAccess): Promise<InboxItem[]> {
    const can = (...rights: AdminRight[]) =>
      rights.some((right) => allowedFor(session, right, null));
    const dashboard = can('dashboard');
    const [paused, failed, orders, spend, quota, staff, flags, drafts] =
      await Promise.all([
        dashboard ? this.settings.paused() : false,
        can('books', 'books.review') ? this.failedBooks(null) : null,
        can('orders') ? this.orders.openStages(null) : null,
        dashboard ? this.totalSpend() : null,
        dashboard ? this.quota.caps() : null,
        dashboard ? this.caps.spendByCountry(null) : null,
        can('references', 'books.review')
          ? this.openFlags(can('references'))
          : null,
        can('seo') ? this.seo.pendingCounts() : null,
      ]);

    const items: InboxItem[] = [];
    if (paused) items.push(this.pausedItem(true));
    if (failed) items.push(...failed);
    if (orders) {
      const count = Object.values(orders).reduce((sum, n) => sum + n, 0);
      if (count) {
        items.push({
          kind: 'orders_waiting',
          severity: 'warning',
          count,
          detail: orders,
          href: '/admin/orders?status=open',
          samples: [],
        });
      }
    }
    if (spend !== null) {
      const severity = nearLimit(spend, this.budgetUsd);
      if (severity) {
        items.push({
          kind: 'spend_budget',
          severity,
          count: percent(spend, this.budgetUsd),
          detail: { used: round(spend), limit: this.budgetUsd },
          href: '/admin/overview',
          samples: [],
        });
      }
    }
    if (quota) {
      for (const cap of ['regular', 'demo'] as const) {
        const { used, limit } = quota[cap];
        const severity = nearLimit(used, limit);
        if (severity) {
          items.push({
            kind: 'daily_cap',
            severity,
            count: percent(used, limit),
            detail: { cap, used, limit },
            href: '/admin/overview',
            samples: [],
          });
        }
      }
    }
    if (staff) {
      const href = can('team') ? '/admin/settings?tab=caps' : '/admin/overview';
      items.push(...this.staffItems(staff, href));
    }
    if (flags) items.push(...flags);
    if (drafts) items.push(...this.draftItems(drafts, null));
    return items;
  }

  private async countryItems(
    session: AdminAccess,
    country: string,
  ): Promise<InboxItem[]> {
    const here = (...rights: AdminRight[]) =>
      rights.some((right) => allowedFor(session, right, [country]));
    const global = (...rights: AdminRight[]) =>
      rights.some((right) => allowedFor(session, right, null));
    if (
      !here(
        'dashboard',
        'examples',
        'catalog',
        'orders',
        'audit',
        'reference.prices',
        'reference.landing',
        'reference.cities',
        'reference.delivery',
        'reference.formats_country',
      )
    ) {
      throw outOfScope('The country is not yours');
    }

    const content = here('examples', 'catalog', 'reference.landing');
    const [paused, overview, orders, failed, staff, drafts, offered] =
      await Promise.all([
        here('dashboard') ? this.settings.paused() : false,
        content ? this.examples.overview(session, country) : null,
        here('orders') ? this.orders.openStages([country]) : null,
        global('books') ? this.failedBooks(country) : null,
        here('dashboard') ? this.caps.spendByCountry([country]) : null,
        global('seo') ? this.seo.pendingCounts() : null,
        this.reference.countries(),
      ]);

    const items: InboxItem[] = [];
    if (paused) items.push(this.pausedItem(global('dashboard')));
    for (const gap of overview?.[0]?.gaps ?? []) {
      const fix = GAP_FIX[gap.code];
      const fixable = allowedFor(
        session,
        fix.right,
        fix.right === 'reference' ? null : [country],
      );
      items.push({
        kind: 'gap',
        severity: fix.severity,
        count: 1,
        gap: gap.code,
        ...(gap.language ? { language: gap.language } : {}),
        href: fixable ? fix.href : null,
        samples: [],
      });
    }
    if (orders) {
      if (orders.paid) {
        items.push({
          kind: 'new_orders',
          severity: 'warning',
          count: orders.paid,
          href: '/admin/orders?status=paid',
          samples: [],
        });
      }
      const moving = (orders.printing ?? 0) + (orders.shipped ?? 0);
      if (moving) {
        items.push({
          kind: 'orders_waiting',
          severity: 'info',
          count: moving,
          detail: {
            printing: orders.printing ?? 0,
            shipped: orders.shipped ?? 0,
          },
          href: '/admin/orders?status=open',
          samples: [],
        });
      }
    }
    if (failed) items.push(...failed);
    if (staff) {
      const href = global('team')
        ? '/admin/settings?tab=caps'
        : '/admin/overview';
      items.push(...this.staffItems(staff, href));
    }
    if (drafts) {
      const languages = countryInfo(country, offered).languages;
      items.push(...this.draftItems(drafts, languages));
    }
    return items;
  }

  private pausedItem(fixable: boolean): InboxItem {
    return {
      kind: 'generation_paused',
      severity: 'danger',
      count: 1,
      href: fixable ? '/admin/settings?tab=generation' : null,
      samples: [],
    };
  }

  /** Books that failed in the last FAILED_DAYS days (in `country`, or anywhere), the latest three by name. */
  private async failedBooks(country: string | null): Promise<InboxItem[]> {
    const where: Prisma.BookWhereInput = {
      status: 'failed',
      createdAt: { gte: new Date(Date.now() - FAILED_DAYS * 86_400_000) },
      ...(country ? { country } : {}),
    };
    const [count, latest] = await Promise.all([
      this.prisma.book.count({ where }),
      this.prisma.book.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, title: true, child: true },
      }),
    ]);
    if (!count) return [];
    return [
      {
        kind: 'failed_books',
        severity: 'danger',
        count,
        detail: { days: FAILED_DAYS },
        href: '/admin/books?status=failed',
        samples: latest.map((book) => ({
          id: book.id,
          label: book.title ?? (book.child as unknown as ChildProfile).name,
          href: `/admin/books/${book.id}`,
        })),
      },
    ];
  }

  private async totalSpend(): Promise<number> {
    const sum = await this.prisma.book.aggregate({ _sum: { costUsd: true } });
    return sum._sum.costUsd ?? 0;
  }

  /** Countries whose staff spend today is near their cap. */
  private staffItems(
    rows: { country: string | null; usd: number; capUsd: number | null }[],
    href: string,
  ): InboxItem[] {
    return rows.flatMap((row) => {
      const severity =
        row.country && row.capUsd !== null
          ? nearLimit(row.usd, row.capUsd)
          : null;
      if (!severity || !row.country || row.capUsd === null) return [];
      return [
        {
          kind: 'staff_spend' as const,
          severity,
          count: percent(row.usd, row.capUsd),
          country: row.country,
          detail: { used: row.usd, limit: row.capUsd },
          href,
          samples: [],
        },
      ];
    });
  }

  /** Open flags, the latest three by book and page; the list itself is in Art references. */
  private async openFlags(references: boolean): Promise<InboxItem[]> {
    const where = { resolved: false };
    const [count, latest] = await Promise.all([
      this.prisma.pageFlag.count({ where }),
      this.prisma.pageFlag.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          page: true,
          bookId: true,
          book: { select: { title: true } },
        },
      }),
    ]);
    if (!count) return [];
    const samples = latest.map((flag) => ({
      id: flag.id,
      label: `${flag.book.title ?? flag.bookId} · ${flag.page}`,
      href: `/admin/books/${flag.bookId}`,
    }));
    return [
      {
        kind: 'page_flags',
        severity: 'warning',
        count,
        href: references ? '/admin/references?tab=flags' : samples[0].href,
        samples,
      },
    ];
  }

  /** SEO drafts waiting to be published, one row per language (only `languages` when given). */
  private draftItems(
    counts: Record<string, number>,
    languages: readonly Language[] | null,
  ): InboxItem[] {
    return Object.entries(counts)
      .filter(
        ([language, count]) =>
          count > 0 && (!languages || languages.includes(language as Language)),
      )
      .map(([language, count]) => ({
        kind: 'seo_drafts' as const,
        severity: 'info' as const,
        count,
        language: language as Language,
        href: `/admin/seo?version=${language}`,
        samples: [],
      }));
  }

  /**
   * The command palette's search: books by title, child's name or id (staff who open books), orders
   * by number (the id's start), within the session's countries for a country manager.
   */
  async search(session: AdminAccess, q: string): Promise<AdminSearch> {
    const query = q.trim();
    if (query.length < 2) return { books: [], orders: [] };
    const books =
      allowedFor(session, 'books', null) ||
      allowedFor(session, 'books.review', null);
    const scope = listScope(session, 'orders');
    const like = `%${escapeLike(query)}%`;
    const prefix = `${escapeLike(query)}%`;
    const [bookRows, orderRows] = await Promise.all([
      books
        ? this.prisma.$queryRaw<
            {
              id: string;
              title: string | null;
              childName: string | null;
              status: string;
            }[]
          >(Prisma.sql`
            select id, title, child->>'name' as "childName", status::text as status
            from "Book"
            where id ilike ${prefix} or title ilike ${like} or child->>'name' ilike ${like}
            order by "createdAt" desc
            limit 8`)
        : [],
      scope && !scope.length
        ? []
        : this.prisma.order.findMany({
            where: {
              id: { startsWith: query, mode: 'insensitive' },
              ...(scope ? { country: { in: scope } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              country: true,
              status: true,
              book: { select: { title: true } },
            },
          }),
    ]);
    return {
      books: bookRows.map((row) => ({
        id: row.id,
        title: row.title,
        childName: row.childName ?? '',
        status: row.status,
      })),
      orders: orderRows.map((row) => ({
        id: row.id,
        country: row.country,
        status: row.status ?? 'timer',
        bookTitle: row.book.title,
      })),
    };
  }
}

function round(usd: number): number {
  return Math.round(usd * 100) / 100;
}
