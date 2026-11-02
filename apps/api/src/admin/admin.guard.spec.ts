import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { AdminPermission, AdminRole } from '@fabulka/shared';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard, RequirePermission } from './admin.guard';

const auth = new AdminAuthService({
  get: (key: string, fallback: string) =>
    ({ ADMIN_SECRET: 'guard-secret' })[key] ?? fallback,
} as unknown as ConfigService);
const guard = new AdminGuard(auth, new Reflector());

class Unmarked {
  route() {}
}
@RequirePermission('seo')
class SeoSection {
  route() {}
  @RequirePermission('orders')
  orders() {}
}

function context(
  roles: AdminRole[] | null,
  target: { cls: object; handler: () => void },
) {
  const cookie = roles ? `admin_session=${auth.issue(roles, 'x@y.kz')}` : '';
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

describe('AdminGuard', () => {
  it('answers 401 without a session', () => {
    expect(() => guard.canActivate(context(null, seo).ctx)).toThrow(
      UnauthorizedException,
    );
  });

  it('lets the SEO role into the SEO section and keeps the session on the request', () => {
    const { ctx, request } = context(['seo'], seo);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.adminSession).toEqual({ roles: ['seo'], who: 'x@y.kz' });
  });

  it('answers 403 to the SEO role elsewhere, including unmarked admin routes', () => {
    expect(() => guard.canActivate(context(['seo'], unmarked).ctx)).toThrow(
      ForbiddenException,
    );
    // A route-level permission replaces the controller's.
    expect(() => guard.canActivate(context(['seo'], orders).ctx)).toThrow(
      ForbiddenException,
    );
  });

  it('lets admin in everywhere', () => {
    for (const target of [unmarked, seo, orders]) {
      expect(guard.canActivate(context(['admin'], target).ctx)).toBe(true);
    }
  });

  it('reads the permission from the decorator', () => {
    const permissions = new Reflector().get<AdminPermission[]>(
      'admin:permission',
      SeoSection,
    );
    expect(permissions).toEqual(['seo']);
  });
});
