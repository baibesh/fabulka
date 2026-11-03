import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ClientError as ClientErrorRow,
  ModelCall as ModelCallRow,
} from '@prisma/client';
import type {
  ClientErrorGroup,
  ClientErrorKind,
  JournalCallsQuery,
  JournalPeriod,
  JournalStats,
  ModelCall,
  ModelCallDetail,
  ModelCallKind,
  ModelCallPage,
  ModelCallStatus,
} from '@fabulka/shared';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 60 * 60 * 1000;
const PERIOD_MS: Record<JournalPeriod, number> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
};
/** Calls on one page of the list. */
const PAGE_SIZE = 50;
/** Error groups shown, and occurrences listed under each. */
const ERROR_GROUPS = 100;
const RECENT_PER_GROUP = 5;

/** Everything but the prompt and output, which only the detail view reads. */
const listed = {
  prompt: false,
  output: false,
} as const;

export function since(period: JournalPeriod, now = Date.now()): Date {
  return new Date(now - PERIOD_MS[period]);
}

/** What the admin's journal reads: spend and latency by model, the calls, the browser errors. */
@Injectable()
export class JournalAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(period: JournalPeriod): Promise<JournalStats> {
    const from = since(period);
    const [rows, clientErrors] = await Promise.all([
      this.prisma.$queryRaw<
        {
          kind: string;
          model: string;
          calls: number;
          errors: number;
          p50: number | null;
          p95: number | null;
          cost: number;
        }[]
      >`
        select kind, model, count(*)::int as calls,
          (count(*) filter (where status = 'error'))::int as errors,
          percentile_cont(0.5) within group (order by "latencyMs")::float as p50,
          percentile_cont(0.95) within group (order by "latencyMs")::float as p95,
          coalesce(sum("costUsd"), 0)::float as cost
        from "ModelCall" where "createdAt" >= ${from}
        group by kind, model order by kind, model`,
      this.prisma.clientError.count({ where: { createdAt: { gte: from } } }),
    ]);
    return {
      period,
      calls: rows.reduce((sum, r) => sum + r.calls, 0),
      errors: rows.reduce((sum, r) => sum + r.errors, 0),
      costUsd: rows.reduce((sum, r) => sum + r.cost, 0),
      clientErrors,
      byModel: rows.map((r) => ({
        kind: r.kind as ModelCallKind,
        model: r.model,
        calls: r.calls,
        errors: r.errors,
        p50Ms: r.p50,
        p95Ms: r.p95,
        avgCostUsd: r.calls ? r.cost / r.calls : 0,
      })),
    };
  }

  /** Newest first, PAGE_SIZE at a time; the cursor is the last call id of the previous page. */
  async calls({
    kind,
    status,
    period,
    cursor,
  }: JournalCallsQuery): Promise<ModelCallPage> {
    const rows = await this.prisma.modelCall.findMany({
      where: { kind, status, createdAt: { gte: since(period) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      omit: listed,
    });
    const page = rows.slice(0, PAGE_SIZE);
    return {
      calls: page.map(toDto),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  async call(id: string): Promise<ModelCallDetail> {
    const row = await this.prisma.modelCall.findUnique({
      where: { id },
      include: { book: { select: { title: true } } },
    });
    if (!row) throw new NotFoundException(`call ${id} not found`);
    return {
      ...toDto(row),
      prompt: row.prompt,
      output: row.output,
      bookTitle: row.book?.title ?? null,
    };
  }

  /** A book's calls in the order they were made. */
  async bookCalls(bookId: string): Promise<ModelCall[]> {
    const rows = await this.prisma.modelCall.findMany({
      where: { bookId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
      omit: listed,
    });
    return rows.map(toDto);
  }

  /** Browser errors grouped by message and page, the most recently seen first. */
  async errors(period: JournalPeriod): Promise<ClientErrorGroup[]> {
    const where = { createdAt: { gte: since(period) } };
    const groups = await this.prisma.clientError.groupBy({
      by: ['message', 'path'],
      where,
      _count: true,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: ERROR_GROUPS,
    });
    if (!groups.length) return [];
    // The latest few of each group, in one query.
    const recent = await this.prisma.$queryRaw<ClientErrorRow[]>`
      select id, kind, message, path, code, status, locale, "userAgent", "createdAt"
      from (
        select *, row_number() over (partition by message, path order by "createdAt" desc) as n
        from "ClientError" where "createdAt" >= ${where.createdAt.gte}
      ) latest
      where n <= ${RECENT_PER_GROUP}
      order by "createdAt" desc`;
    const key = (g: { message: string; path: string }) =>
      `${g.path}\n${g.message}`;
    const byGroup = new Map<string, ClientErrorRow[]>();
    for (const row of recent) {
      byGroup.set(key(row), [...(byGroup.get(key(row)) ?? []), row]);
    }
    return groups.map((g) => ({
      message: g.message,
      path: g.path,
      count: g._count,
      lastSeen: g._max.createdAt!.toISOString(),
      recent: (byGroup.get(key(g)) ?? []).map((row) => ({
        id: row.id,
        kind: row.kind as ClientErrorKind,
        code: row.code,
        status: row.status,
        locale: row.locale,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
    }));
  }
}

function toDto(row: Omit<ModelCallRow, 'prompt' | 'output'>): ModelCall {
  return {
    id: row.id,
    bookId: row.bookId,
    kind: row.kind as ModelCallKind,
    model: row.model,
    status: row.status as ModelCallStatus,
    attempt: row.attempt,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    images: row.images,
    costUsd: row.costUsd,
    responseId: row.responseId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    references: row.references ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}
