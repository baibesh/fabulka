import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUILTIN_ROLES, SUPER_ROLE, accessOf } from '@fabulka/shared';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { AdminSession } from '../admin/admin-auth.service';
import { RequirePermission } from '../admin/admin.guard';
import {
  Audit,
  AuditInterceptor,
  NoAudit,
  trailOf as trailOfRequest,
} from './audit.interceptor';
import type { AuditInput, AuditService } from './audit.service';

const admin: AdminSession = {
  ...accessOf([SUPER_ROLE], BUILTIN_ROLES, []),
  who: 'admin@e2e.test',
  staffId: 'staff-1',
};

@RequirePermission('reference.prices')
class Routes {
  @Audit('prices.set', { target: 'prices' })
  prices() {}

  @RequirePermission('examples', 'books')
  plain() {}

  @NoAudit()
  preview() {}
}

function setup() {
  const recorded: AuditInput[] = [];
  const audit = { record: (input: AuditInput) => recorded.push(input) };
  const interceptor = new AuditInterceptor(
    audit as unknown as AuditService,
    new Reflector(),
  );
  return { interceptor, recorded };
}

function context(
  handler: keyof Routes,
  request: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the handler is only a metadata key
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const request = (over: Record<string, unknown> = {}) => ({
  method: 'PUT',
  path: '/api/admin/reference/prices',
  route: { path: '/api/admin/reference/prices' },
  params: {},
  query: {},
  body: { deliveryKzt: 0 },
  headers: { 'user-agent': 'jest', 'x-real-ip': '10.0.0.1' },
  socket: {},
  adminSession: admin,
  ...over,
});

/** The trail of a fake request. */
const trailOf = (req: object) =>
  trailOfRequest(req as Parameters<typeof trailOfRequest>[0]);

const ok: CallHandler = { handle: () => of({ saved: true }) };

describe('AuditInterceptor', () => {
  it('records a successful write: who, section, action, target, country, client', async () => {
    const { interceptor, recorded } = setup();
    const req = request({ query: { country: 'de' } });
    await lastValueFrom(interceptor.intercept(context('prices', req), ok));
    expect(recorded).toEqual([
      {
        actor: admin,
        section: 'reference',
        action: 'prices.set',
        targetType: 'prices',
        targetId: null,
        country: 'DE',
        summary: { data: { body: { deliveryKzt: 0 } } },
        ip: '10.0.0.1',
        userAgent: 'jest',
      },
    ]);
  });

  it("takes the route's trail over the defaults: target, country and diff", async () => {
    const { interceptor, recorded } = setup();
    const req = request({ query: { country: 'KZ' } });
    trailOf(req)
      .target('prices', 'DE')
      .in('DE')
      .diff({ deliveryKzt: 1500 }, { deliveryKzt: 0 });
    await lastValueFrom(interceptor.intercept(context('prices', req), ok));
    expect(recorded[0]).toMatchObject({
      targetId: 'DE',
      country: 'DE',
      summary: {
        changes: [{ path: 'deliveryKzt', before: 1500, after: 0 }],
      },
    });
  });

  it('records an unnamed route as "other" with its method and path, its id from the params', async () => {
    const { interceptor, recorded } = setup();
    const req = request({
      method: 'DELETE',
      route: { path: '/api/admin/examples/:id' },
      params: { id: 'ex1' },
      body: { country: 'es', secret: 'x' },
    });
    await lastValueFrom(interceptor.intercept(context('plain', req), ok));
    expect(recorded[0]).toMatchObject({
      section: 'examples',
      action: 'other',
      targetId: 'ex1',
      country: 'ES',
      summary: {
        data: {
          body: { country: 'es', secret: '[redacted]' },
          method: 'DELETE',
          path: '/api/admin/examples/:id',
        },
      },
    });
  });

  it('records nothing for a read, a preview, a skipped trail or a request without a session', async () => {
    const { interceptor, recorded } = setup();
    await lastValueFrom(
      interceptor.intercept(context('prices', request({ method: 'GET' })), ok),
    );
    await lastValueFrom(
      interceptor.intercept(
        context('preview', request({ method: 'POST' })),
        ok,
      ),
    );
    const skipped = request();
    trailOf(skipped).skip();
    await lastValueFrom(interceptor.intercept(context('prices', skipped), ok));
    await lastValueFrom(
      interceptor.intercept(
        context('prices', request({ adminSession: undefined })),
        ok,
      ),
    );
    expect(recorded).toEqual([]);
  });

  it('records nothing when the write fails', async () => {
    const { interceptor, recorded } = setup();
    const failing: CallHandler = {
      handle: () => throwError(() => new Error('scope_forbidden')),
    };
    await expect(
      lastValueFrom(
        interceptor.intercept(context('prices', request()), failing),
      ),
    ).rejects.toThrow('scope_forbidden');
    expect(recorded).toEqual([]);
  });

  it('records a route that answers nothing (204) once', async () => {
    const { interceptor, recorded } = setup();
    const empty: CallHandler = { handle: () => of(undefined) };
    await lastValueFrom(
      interceptor.intercept(
        context('prices', request({ method: 'DELETE' })),
        empty,
      ),
      { defaultValue: undefined },
    );
    expect(recorded).toHaveLength(1);
  });
});
