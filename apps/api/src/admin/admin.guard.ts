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
  allowed,
  type AdminPermission,
} from '@fabulka/shared';
import type { Request } from 'express';
import {
  AdminAuthService,
  readCookie,
  SESSION_COOKIE,
  type AdminSession,
} from './admin-auth.service';

const PERMISSION_KEY = 'admin:permission';

/**
 * The admin section(s) a controller or route belongs to: a session whose roles grant any of them
 * passes (ROLE_PERMISSIONS in @fabulka/shared). A route-level one replaces the controller's. Routes
 * without one are admin-only.
 */
export const RequirePermission = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

export type AdminRequest = Request & { adminSession?: AdminSession };

/**
 * Lets through only requests with a valid admin session cookie whose roles open the route: 401
 * without a session, 403 admin_forbidden for a section the roles do not grant.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const session = this.auth.verify(
      readCookie(request.headers.cookie, SESSION_COOKIE),
    );
    if (!session) throw new UnauthorizedException('Войдите в админку');
    const required = this.reflector.getAllAndOverride<
      AdminPermission[] | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!allowed(session.roles, required)) {
      throw new ForbiddenException({
        code: ADMIN_FORBIDDEN,
        message: 'Этот раздел админки вам недоступен',
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
      roles: [],
      who: null,
    },
);
