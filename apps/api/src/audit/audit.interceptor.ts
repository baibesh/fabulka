import {
  type CallHandler,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRight, AuditAction, AuditSummary } from '@fabulka/shared';
import { sectionOfRight } from '@fabulka/shared';
import { type Observable, tap } from 'rxjs';
import { PERMISSION_KEY, type AdminRequest } from '../admin/admin.guard';
import { clientIp } from '../geo/geo.guard';
import { bodySummary, diffSummary } from './audit';
import { AuditService } from './audit.service';

const AUDIT_KEY = 'admin:audit';
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** What a route says about its audit event; the route's trail (AuditTrail) can add to it. */
export interface AuditMeta {
  action: AuditAction;
  /** What it acts on ("example", "order", "prices"…). */
  target?: string;
  /** The route parameter holding the target's id; by default id, slug or key. */
  param?: string;
}

/** Names the action an admin write is recorded as (and its target type). */
export const Audit = (
  action: AuditAction,
  options: Omit<AuditMeta, 'action'> = {},
) => SetMetadata(AUDIT_KEY, { action, ...options } satisfies AuditMeta);

/** A POST that changes nothing (a preview): no event. */
export const NoAudit = () => SetMetadata(AUDIT_KEY, false);

/**
 * What a route adds to its audit event, where the generic one says too little: the target, the
 * country, a before/after diff, facts, or that nothing changed after all (skip).
 */
export class AuditTrail {
  action?: AuditAction;
  targetType?: string;
  targetId?: string | null;
  country?: string | null;
  summary?: AuditSummary;
  skipped = false;

  as(action: AuditAction): this {
    this.action = action;
    return this;
  }

  target(type: string, id: string | null): this {
    this.targetType = type;
    this.targetId = id;
    return this;
  }

  in(country: string | null): this {
    this.country = country;
    return this;
  }

  /** The change as a field diff (values for small objects, changed paths for big ones). */
  diff(before: unknown, after: unknown): this {
    this.summary = { ...this.summary, ...diffSummary(before, after) };
    return this;
  }

  /** Facts about the action (a new status, the languages started, SEO history entries). */
  note(data: Record<string, unknown>): this {
    this.summary = {
      ...this.summary,
      data: { ...this.summary?.data, ...data },
    };
    return this;
  }

  skip(): this {
    this.skipped = true;
    return this;
  }
}

type AuditedRequest = AdminRequest & { auditTrail?: AuditTrail };

/** The request's trail, made on first use. */
export function trailOf(request: AuditedRequest): AuditTrail {
  request.auditTrail ??= new AuditTrail();
  return request.auditTrail;
}

/** The route's audit trail (use only on admin routes). */
export const Trail = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuditTrail =>
    trailOf(context.switchToHttp().getRequest<AuditedRequest>()),
);

/** A two-letter country code, upper-cased, or null. */
function code(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

/** The route parameter that names the target. */
function targetParam(
  params: Record<string, string | string[]> | undefined,
  name: string | undefined,
): string | null {
  if (!params) return null;
  const value = name
    ? params[name]
    : (params.id ?? params.slug ?? params.key ?? null);
  return Array.isArray(value) ? value.join('/') : (value ?? null);
}

/**
 * Records every successful admin write (POST, PUT, PATCH, DELETE behind AdminGuard): who, the
 * route's section (its first RequirePermission) and action (@Audit, else "other" with the method
 * and path), the target from the route's parameters, the country from ?country= or the body, and
 * the body's fields made safe; a route's AuditTrail replaces any of these, with a diff where it
 * matters. Refused and failed requests are not recorded.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    if (!WRITES.has(request.method)) return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    const meta = this.reflector.getAllAndOverride<
      AuditMeta | false | undefined
    >(AUDIT_KEY, targets);
    if (meta === false) return next.handle();
    let recorded = false;
    return next.handle().pipe(
      tap({
        next: () => {
          if (recorded) return;
          recorded = true;
          this.write(request, meta, targets);
        },
        complete: () => {
          if (recorded) return;
          recorded = true;
          this.write(request, meta, targets);
        },
      }),
    );
  }

  private write(
    request: AuditedRequest,
    meta: AuditMeta | undefined,
    targets: Parameters<Reflector['getAllAndOverride']>[1],
  ): void {
    const session = request.adminSession;
    if (!session) return;
    const trail = request.auditTrail;
    if (trail?.skipped) return;
    const rights = this.reflector.getAllAndOverride<AdminRight[] | undefined>(
      PERMISSION_KEY,
      targets,
    );
    const action = trail?.action ?? meta?.action ?? 'other';
    const route = (request.route as { path?: string } | undefined)?.path;
    const body = request.body as Record<string, unknown> | undefined;
    const fallback: AuditSummary =
      action === 'other'
        ? {
            ...bodySummary(body),
            data: {
              ...bodySummary(body).data,
              method: request.method,
              path: route ?? request.path,
            },
          }
        : bodySummary(body);
    this.audit.record({
      actor: session,
      section: rights?.length ? sectionOfRight(rights[0]) : 'dashboard',
      action,
      targetType: trail?.targetType ?? meta?.target ?? null,
      targetId:
        trail?.targetId !== undefined
          ? trail.targetId
          : targetParam(request.params, meta?.param),
      country:
        trail?.country !== undefined
          ? trail.country
          : (code(request.query?.country) ??
            (body && typeof body === 'object' ? code(body.country) : null)),
      summary: trail?.summary ?? fallback,
      ip: clientIp(request) || null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }
}
