import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { AuditEvent as AuditRow, Prisma } from '@prisma/client';
import {
  AUDIT_RETENTION_DAYS,
  AuditQuerySchema,
  type AdminAccess,
  type AuditEvent,
  type AuditPage,
  type AuditSummary,
} from '@fabulka/shared';
import { z } from 'zod';
import { listCountries, listScope } from '../admin/scope';
import { PrismaService } from '../prisma/prisma.service';
import { capSummary, cut, toCsv } from './audit';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The CSV export holds at most this many events (newest first). */
export const CSV_LIMIT = 10_000;
const CSV_PAGE = 1_000;

type Query = z.output<typeof AuditQuerySchema>;

/** Who did it, as the admin session had it. */
export interface AuditActor {
  who: string | null;
  staffId: string | null;
  roles: readonly string[];
}

/** One admin write, before it is stored. */
export interface AuditInput {
  actor: AuditActor;
  section: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  country?: string | null;
  summary?: AuditSummary;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The admin's «Activity»: one row per admin write (AuditInterceptor records them), listed for the
 * superadmin in full and for a country-scoped `audit` right only in its countries (events of no
 * country are global staff's). Writing never throws and never makes the request wait.
 */
@Injectable()
export class AuditService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  /** The row as it is stored: summary made safe and cut to size, strings bounded. */
  static row(input: AuditInput): Prisma.AuditEventUncheckedCreateInput {
    const country = input.country?.trim().toUpperCase() || null;
    return {
      actorStaffId: input.actor.staffId,
      actorEmail: input.actor.who?.toLowerCase() ?? null,
      actorRoles: [...input.actor.roles],
      section: cut(input.section, 40),
      action: cut(input.action, 60),
      targetType: input.targetType ? cut(input.targetType, 40) : null,
      targetId: input.targetId ? cut(input.targetId, 200) : null,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      summary: capSummary(input.summary ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ? cut(input.ip, 64) : null,
      userAgent: input.userAgent ? cut(input.userAgent, 300) : null,
    };
  }

  /** Stores an event in the background; a failure is only logged. */
  record(input: AuditInput): void {
    let data: Prisma.AuditEventUncheckedCreateInput;
    try {
      data = AuditService.row(input);
    } catch (error) {
      this.logger.warn(`audit event not recorded: ${describe(error)}`);
      return;
    }
    const done = this.prisma.auditEvent.create({ data }).then(
      () => undefined,
      (error: unknown) =>
        this.logger.warn(`audit event not recorded: ${describe(error)}`),
    );
    this.pending.add(done);
    void done.then(() => this.pending.delete(done));
  }

  /** Resolves once the events recorded so far are stored (tests, shutdown). */
  async idle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  async onModuleDestroy() {
    await this.idle();
  }

  /**
   * The filter for a session and query: a country-scoped session sees only events of its countries
   * (narrowed further by ?country=); global staff see every event, ?country= narrowing to one.
   */
  where(session: AdminAccess, query: Query): Prisma.AuditEventWhereInput {
    const scope = listScope(session, 'audit');
    const countries = listCountries(scope, query.country ?? null);
    const and: Prisma.AuditEventWhereInput[] = [];
    if (countries) and.push({ country: { in: countries } });
    if (query.actor) and.push({ actorEmail: query.actor });
    if (query.section) and.push({ section: query.section });
    if (query.from)
      and.push({ at: { gte: new Date(`${query.from}T00:00:00Z`) } });
    if (query.to)
      and.push({
        at: {
          lt: new Date(new Date(`${query.to}T00:00:00Z`).getTime() + DAY_MS),
        },
      });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { actorEmail: contains },
          { action: contains },
          { targetType: contains },
          { targetId: contains },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  /** A page of events, newest first; `nextCursor` continues it. */
  async list(session: AdminAccess, query: Query): Promise<AuditPage> {
    const where = this.where(session, query);
    const after = parseCursor(query.cursor);
    const rows = await this.prisma.auditEvent.findMany({
      where: after
        ? {
            AND: [
              where,
              {
                OR: [
                  { at: { lt: after.at } },
                  { at: after.at, id: { lt: after.id } },
                ],
              },
            ],
          }
        : where,
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      events: page.map(dto),
      nextCursor:
        rows.length > query.limit && last
          ? `${last.at.toISOString()}_${last.id}`
          : null,
    };
  }

  /** The people with events the session may see, for the filter. */
  async actors(session: AdminAccess): Promise<string[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        ...this.where(session, { limit: 1 }),
        actorEmail: { not: null },
      },
      distinct: ['actorEmail'],
      select: { actorEmail: true },
      orderBy: { actorEmail: 'asc' },
      take: 500,
    });
    return rows.map((r) => r.actorEmail!).filter(Boolean);
  }

  /** The filtered list as CSV, newest first, at most CSV_LIMIT events. */
  async csv(session: AdminAccess, query: Query): Promise<string> {
    const events: AuditEvent[] = [];
    let cursor: string | undefined;
    while (events.length < CSV_LIMIT) {
      const page = await this.list(session, {
        ...query,
        cursor,
        limit: Math.min(CSV_PAGE, CSV_LIMIT - events.length),
      });
      events.push(...page.events);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return toCsv(events);
  }

  /** Retention: events older than AUDIT_RETENTION_DAYS go. */
  async prune(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS);
    const { count } = await this.prisma.auditEvent.deleteMany({
      where: { at: { lt: cutoff } },
    });
    return count;
  }
}

/** Runs the retention once a day, and once on start. */
@Injectable()
export class AuditCleaner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditCleaner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly audit: AuditService) {}

  onModuleInit() {
    const sweep = () =>
      this.audit
        .prune()
        .then((count) => {
          if (count)
            this.logger.log(`audit retention: ${count} events deleted`);
        })
        .catch((error: unknown) =>
          this.logger.error('audit retention failed', error),
        );
    void sweep();
    this.timer = setInterval(() => void sweep(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}

function parseCursor(
  cursor: string | undefined,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const split = cursor.indexOf('_');
  if (split < 0) return null;
  const at = new Date(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  return Number.isNaN(at.getTime()) || !id ? null : { at, id };
}

export function dto(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorEmail: row.actorEmail,
    actorStaffId: row.actorStaffId,
    actorRoles: row.actorRoles,
    section: row.section,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    country: row.country,
    summary: (row.summary ?? {}) as AuditSummary,
    ip: row.ip,
    userAgent: row.userAgent,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
