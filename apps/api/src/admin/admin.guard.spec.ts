import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { AdminRight } from '@fabulka/shared';
import { StaffAccessService } from '../staff/staff-access.service';
import { fakeStaffPrisma, staffRow } from '../staff/staff.testing';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, RequirePermission } from './admin.guard';

const auth = new AdminAuthService({
  get: (key: string, fallback: string) =>
    ({ ADMIN_SECRET: 'guard-secret' })[key] ?? fallback,
} as unknown as ConfigService);
const db = fakeStaffPrisma([
  staffRow({ email: 'x@y.kz', keycloakId: 'kc-seo', roles: ['seo'] }),
  staffRow({
    email: 'de@y.kz',
    keycloakId: 'kc-de',
    roles: ['country_manager'],
    countries: ['DE'],
  }),
]);
const staff = new StaffAccessService(db.service);
const guard = new AdminGuard(auth, staff, new Reflector());

class Unmarked {
  route() {}
}
@RequirePermission('seo')
class SeoSection {
  route() {}
  @RequirePermission('orders')
  orders() {}
  @RequirePermission('reference')
  reference() {}
  @RequirePermission('reference.prices')
  prices() {}
}

/** Who signs in: the seo row, the DE country manager, or a realm admin with no row. */
const PEOPLE = {
  seo: { email: 'x@y.kz', sub: 'kc-seo', realm: [] },
  de: { email: 'de@y.kz', sub: 'kc-de', realm: [] },
  admin: { email: 'owner@y.kz', sub: 'kc-owner', realm: ['admin' as const] },
};

function context(
  who: keyof typeof PEOPLE | null,
  target: { cls: object; handler: () => void },
) {
  const cookie = who ? `admin_session=${auth.issue(PEOPLE[who])}` : '';
  const request: Record<string, unknown> = { headers: { cookie } };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => target.handler,
      getClass: () => target.cls,
    } as unknown as ExecutionContext,
  };
}

// The handler as Nest hands it to the guard: the method itself, where the decorators left their metadata.
const method = (cls: { prototype: object }, name: string) =>
  Object.getOwnPropertyDescriptor(cls.prototype, name)!.value as () => void;
const unmarked = { cls: Unmarked, handler: method(Unmarked, 'route') };
const seo = { cls: SeoSection, handler: method(SeoSection, 'route') };
const orders = { cls: SeoSection, handler: method(SeoSection, 'orders') };
const reference = {
  cls: SeoSection,
  handler: method(SeoSection, 'reference'),
};
const prices = { cls: SeoSection, handler: method(SeoSection, 'prices') };

describe('AdminGuard', () => {
  beforeEach(() => staff.invalidate());

  it('answers 401 without a session', async () => {
    await expect(guard.canActivate(context(null, seo).ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets the SEO role into the SEO section and keeps the session on the request', async () => {
    const { ctx, request } = context('seo', seo);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.adminSession).toMatchObject({
      roles: ['seo'],
      who: 'x@y.kz',
      global: ['seo'],
      countries: [],
    });
  });

  it('answers 403 to the SEO role elsewhere, including unmarked admin routes', async () => {
    await expect(
      guard.canActivate(context('seo', unmarked).ctx),
    ).rejects.toThrow(ForbiddenException);
    // A route-level permission replaces the controller's.
    await expect(guard.canActivate(context('seo', orders).ctx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets the country manager into its sections and a part of reference, not the whole', async () => {
    const { ctx, request } = context('de', orders);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.adminSession).toMatchObject({ countries: ['DE'] });
    expect(await guard.canActivate(context('de', prices).ctx)).toBe(true);
    await expect(
      guard.canActivate(context('de', reference).ctx),
    ).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context('de', seo).ctx)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a realm admin in everywhere, with no staff row', async () => {
    for (const target of [unmarked, seo, orders, reference]) {
      expect(await guard.canActivate(context('admin', target).ctx)).toBe(true);
    }
  });

  it('answers 401 once the person is disabled, at the next request after a Team write', async () => {
    const row = db.prisma.staffMember.rows.find((r) => r.email === 'de@y.kz')!;
    expect(await guard.canActivate(context('de', orders).ctx)).toBe(true);
    row.status = 'disabled';
    staff.invalidate();
    await expect(guard.canActivate(context('de', orders).ctx)).rejects.toThrow(
      UnauthorizedException,
    );
    row.status = 'active';
  });

  it('reads the permission from the decorator', () => {
    const permissions = new Reflector().get<AdminRight[]>(
      'admin:permission',
      SeoSection,
    );
    expect(permissions).toEqual(['seo']);
  });
});
