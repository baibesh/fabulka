import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ADMIN_FORBIDDEN,
  NO_ACCESS,
  allowed,
  type AdminRight,
} from '@fabulka/shared';
import type { Request } from 'express';
import {
  AdminAuthService,
  readCookie,
  SESSION_COOKIE,
  type AdminSession,
} from './admin-auth.service';
import { StaffAccessService } from '../staff/staff-access.service';

const PERMISSION_KEY = 'admin:permission';

/**
 * The admin section(s), or section parts ("reference.prices"), a controller or route belongs to: a
 * session holding any of them in some scope passes; a route that acts on a country narrows further
 * with allowedFor(). A route-level one replaces the controller's. Routes without one are
 * superadmin-only.
 */
export const RequirePermission = (...permissions: AdminRight[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

export type AdminRequest = Request & { adminSession?: AdminSession };

/**
 * Lets through only requests with a valid admin session cookie whose person is staff now (rights
 * read from the database, StaffAccessService) and may open the route: 401 without a session or for
 * someone no longer staff (disabled, no roles), 403 admin_forbidden for a section they do not hold.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly staff: StaffAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = await this.staff.resolve(
      this.auth.verify(readCookie(request.headers.cookie, SESSION_COOKIE)),
    );
    if (!session) throw new UnauthorizedException('Sign in to the admin');
    const required = this.reflector.getAllAndOverride<AdminRight[] | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed(session, required)) {
      throw new ForbiddenException({
        code: ADMIN_FORBIDDEN,
        message: 'This section of the admin is not open to you',
      });
    }
    request.adminSession = session;
    return true;
  }
}

/** The admin session the guard let in (use only behind AdminGuard). */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, context: ExecutionContext): AdminSession =>
    context.switchToHttp().getRequest<AdminRequest>().adminSession ?? {
      ...NO_ACCESS,
      who: null,
      staffId: null,
    },
);
