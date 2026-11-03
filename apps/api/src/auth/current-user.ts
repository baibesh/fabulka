import {
  createParamDecorator,
  Injectable,
  type ExecutionContext,
  type NestMiddleware,
} from '@nestjs/common';
import type { RealmRole } from '@fabulka/shared';
import type { NextFunction, Request, Response } from 'express';
import { AuthService } from './auth.service';

/** The signed-in parent, from the `fabulka_session` cookie. */
export interface SessionUser {
  /** User.id in our DB. */
  id: string;
  email: string | null;
  name: string | null;
  /** Admin realm roles at sign-in (REALM_ROLES in @fabulka/shared); what they open is in Team. */
  roles: RealmRole[];
}

type RequestWithUser = Request & { sessionUser?: SessionUser };

/** Reads the session cookie once per request, for CurrentUser. */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  use(request: RequestWithUser, _response: Response, next: NextFunction) {
    request.sessionUser = this.auth.readSession(request.headers.cookie);
    next();
  }
}

/** The signed-in parent, or null for an anonymous visitor (sign-in is never required). */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): SessionUser | null =>
    context.switchToHttp().getRequest<RequestWithUser>().sessionUser ?? null,
);
