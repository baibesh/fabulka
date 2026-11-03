import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTH_ERROR,
  EmailSchema,
  REALM_ROLES,
  isSuperAdmin,
  realmRolesOf,
  type AuthMe,
  type RealmRole,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import {
  AdminAuthService,
  readCookie,
  SESSION_COOKIE,
  type AdminSession,
} from '../admin/admin-auth.service';
import { anonymousBooksOf } from '../books/books.service';
import { cookieHeader, sameString, seal, unseal } from '../common/signed';
import { anonymousOrdersOf } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAccessService } from '../staff/staff-access.service';
import {
  clientKeyParam,
  codeChallenge,
  randomToken,
  realmRoles,
  safeReturn,
  uiLocale,
  withAuthParam,
} from './auth.util';
import type { SessionUser } from './current-user';
import { OidcClient, type Claims } from './oidc';

export const AUTH_SESSION_COOKIE = 'fabulka_session';
/** The Keycloak ID token, only for the logout hint; sent to /api/auth only. */
export const ID_TOKEN_COOKIE = 'fabulka_idt';
/** state, nonce, PKCE verifier, return path, visitor key and language between login and callback. */
export const AUTH_STATE_COOKIE = 'fabulka_auth';
const AUTH_COOKIE_PATH = '/api/auth';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_MS = 10 * 60 * 1000;
const MOCK_CODE_MS = 60 * 1000;

interface LoginState {
  state: string;
  nonce: string;
  verifier: string;
  return: string;
  key?: string;
  lang?: string;
}

interface SessionPayload {
  uid: string;
  email: string | null;
  name: string | null;
  /** Admin realm roles at sign-in (REALM_ROLES in @fabulka/shared). */
  roles?: RealmRole[];
  /** Before roles: had the realm role admin. */
  admin?: boolean;
}

interface MockCode {
  state: string;
  email: string;
  roles: RealmRole[];
}

/** What a controller sends back: a redirect plus the cookies to set. */
export interface AuthRedirect {
  location: string;
  cookies: string[];
}

/**
 * Optional sign-in with Keycloak (OIDC authorization code + PKCE S256). Anonymous use keeps
 * working; signing in moves the visitor's books and orders to their account and, for the realm role
 * `admin`, opens the admin. AUTH_MOCK=true swaps Keycloak for a fake provider inside the API,
 * for E2E runs; it is refused in production.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  private readonly publicUrl: string;
  private readonly oidc?: OidcClient;
  /** The fake provider is on (AUTH_MOCK=true outside production). */
  readonly mock: boolean;
  /** Sign-in is configured: Keycloak or the fake provider, and a secret to sign cookies. */
  readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly admin: AdminAuthService,
    private readonly staff: StaffAccessService,
  ) {
    const production = config.get('NODE_ENV') === 'production';
    this.publicUrl = config
      .get<string>('PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const mockAsked = config.get('AUTH_MOCK', 'false') === 'true';
    if (mockAsked && production) {
      this.logger.error('AUTH_MOCK=true is ignored in production');
    }
    this.mock = mockAsked && !production;
    const issuer = config
      .get<string>('KEYCLOAK_ISSUER', '')
      .replace(/\/+$/, '');
    const clientId = config.get<string>('KEYCLOAK_CLIENT_ID', '');
    const clientSecret = config.get<string>('KEYCLOAK_CLIENT_SECRET', '');
    if (!this.mock && issuer && clientId && clientSecret) {
      this.oidc = new OidcClient({
        issuer,
        clientId,
        clientSecret,
        redirectUri: `${this.publicUrl}/api/auth/callback`,
      });
    }
    const secret = config.get<string>('AUTH_SECRET', '');
    this.secret = secret || randomBytes(32).toString('hex');
    const configured = this.mock || Boolean(this.oidc);
    if (configured && production && !secret) {
      this.logger.error('AUTH_SECRET is not set in production: sign-in is off');
    }
    this.enabled = configured && (!production || Boolean(secret));
    if (!configured) {
      this.logger.log('Keycloak is not configured: sign-in is off');
    }
  }

  /** Starts sign-in: where to send the browser and the state cookie to remember. */
  async login(query: {
    return?: unknown;
    lang?: unknown;
    key?: unknown;
  }): Promise<AuthRedirect> {
    const returnTo = safeReturn(query.return);
    if (!this.enabled) {
      return { location: withAuthParam(returnTo, AUTH_ERROR), cookies: [] };
    }
    const login: LoginState = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(48),
      return: returnTo,
      key: clientKeyParam(query.key),
      lang: uiLocale(query.lang),
    };
    const cookies = [
      this.stateCookie(seal(this.secret, { ...login }, STATE_MS)),
    ];
    if (this.mock) {
      const params = new URLSearchParams({ state: login.state });
      if (login.lang) params.set('lang', login.lang);
      return { location: `/api/auth/mock?${params.toString()}`, cookies };
    }
    try {
      const location = await this.oidc!.authorizationUrl({
        state: login.state,
        nonce: login.nonce,
        challenge: codeChallenge(login.verifier),
        locale: login.lang,
      });
      return { location, cookies };
    } catch (error) {
      this.logger.warn(`sign-in could not start: ${message(error)}`);
      return { location: withAuthParam(returnTo, AUTH_ERROR), cookies: [] };
    }
  }

  /**
   * Back from Keycloak: checks state, trades the code, signs the parent in, moves this
   * visitor's anonymous books and orders to them and goes back to where they started. Every failure
   * returns there with ?auth=error instead of an error page.
   */
  async callback(
    query: { code?: unknown; state?: unknown; error?: unknown },
    cookieHeaderValue: string | undefined,
  ): Promise<AuthRedirect> {
    const login = unseal<LoginState>(
      this.secret,
      readCookie(cookieHeaderValue, AUTH_STATE_COOKIE),
    );
    const clearState = this.stateCookie('', 0);
    const fail = (reason: string): AuthRedirect => {
      this.logger.warn(`sign-in failed: ${reason}`);
      return {
        location: withAuthParam(safeReturn(login?.return), AUTH_ERROR),
        cookies: [clearState],
      };
    };
    if (!this.enabled) return fail('sign-in is off');
    if (!login) return fail('no or expired state cookie');
    if (
      typeof query.state !== 'string' ||
      !sameString(query.state, login.state)
    ) {
      return fail('state does not match');
    }
    if (query.error !== undefined) {
      const code = typeof query.error === 'string' ? query.error : 'unknown';
      return fail(`provider error ${code.slice(0, 60)}`);
    }
    if (typeof query.code !== 'string' || !query.code) {
      return fail('no code');
    }

    let identity: {
      sub: string;
      email: string | null;
      emailVerified: boolean;
      name: string | null;
      roles: RealmRole[];
      idToken?: string;
    };
    try {
      identity = this.mock
        ? this.mockIdentity(query.code, login.state)
        : await this.keycloakIdentity(query.code, login);
    } catch (error) {
      return fail(message(error));
    }

    try {
      const user = await this.prisma.user.upsert({
        where: { sub: identity.sub },
        create: { sub: identity.sub },
        update: {},
      });
      if (login.key) {
        const { count } = await this.prisma.book.updateMany({
          where: anonymousBooksOf(login.key),
          data: { userId: user.id },
        });
        if (count) this.logger.log(`${count} anonymous books moved to a user`);
        const orders = await this.prisma.order.updateMany({
          where: anonymousOrdersOf(login.key),
          data: { userId: user.id },
        });
        if (orders.count) {
          this.logger.log(`${orders.count} anonymous orders moved to a user`);
        }
      }
      const session: SessionPayload = {
        uid: user.id,
        email: identity.email,
        name: identity.name,
        roles: identity.roles,
      };
      const cookies = [
        clearState,
        this.cookie(
          AUTH_SESSION_COOKIE,
          seal(this.secret, { ...session }, SESSION_MS),
          SESSION_MS,
        ),
      ];
      if (identity.idToken) {
        cookies.push(
          this.cookie(
            ID_TOKEN_COOKIE,
            identity.idToken,
            SESSION_MS,
            AUTH_COOKIE_PATH,
          ),
        );
      }
      // Staff (a row in Team, or a Keycloak realm role admin/seo) get the admin cookie too; what
      // they may open is read from the database on each admin request.
      const staff = await this.staff.signIn({
        sub: identity.sub,
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: identity.name,
        realmRoles: identity.roles,
      });
      if (staff) cookies.push(this.admin.cookie(this.admin.issue(staff)));
      return { location: login.return, cookies };
    } catch (error) {
      return fail(message(error));
    }
  }

  /**
   * Signs out here; the web then opens the returned URL to end the Keycloak session too, which comes
   * back to `returnTo` (a path on this site, e.g. "/en/catalog"; "/" otherwise). Keycloak accepts it
   * as a post-logout redirect URI under PUBLIC_URL/* (realm-fabulka.json).
   */
  async logout(
    cookieHeaderValue: string | undefined,
    returnTo?: unknown,
  ): Promise<{ url: string; cookies: string[] }> {
    const back = safeReturn(returnTo);
    const session = this.readSession(cookieHeaderValue);
    const cookies = [
      this.cookie(AUTH_SESSION_COOKIE, '', 0),
      this.cookie(ID_TOKEN_COOKIE, '', 0, AUTH_COOKIE_PATH),
    ];
    if (readCookie(cookieHeaderValue, SESSION_COOKIE)) {
      cookies.push(this.admin.clearedCookie());
    }
    let url = back;
    if (this.oidc && session) {
      url =
        (await this.oidc
          .endSessionUrl(
            readCookie(cookieHeaderValue, ID_TOKEN_COOKIE),
            `${this.publicUrl}${back}`,
          )
          .catch((error: unknown) => {
            this.logger.warn(`no Keycloak logout URL: ${message(error)}`);
            return undefined;
          })) ?? back;
    }
    return { url, cookies };
  }

  /** The signed-in parent and, from the admin cookie (rights read now), whether they are staff. */
  async me(
    user: SessionUser | null,
    cookieHeaderValue?: string,
  ): Promise<AuthMe> {
    let staff: AdminSession | null = null;
    if (user) {
      staff = await this.staff
        .resolve(
          this.admin.verify(readCookie(cookieHeaderValue, SESSION_COOKIE)),
        )
        .catch(() => null);
    }
    // The admin cookie lasts hours, the site session a month: a realm role holder keeps the
    // admin link after it ends (the admin then signs them in again through Keycloak).
    const superadmin = staff
      ? isSuperAdmin(staff)
      : Boolean(user?.roles.includes('admin'));
    const isStaff = Boolean(staff) || Boolean(user?.roles.length);
    return {
      enabled: this.enabled,
      user: user
        ? {
            email: user.email,
            name: user.name,
            admin: superadmin,
            seo: isStaff && !superadmin,
            staff: isStaff,
          }
        : null,
    };
  }

  /** The signed-in parent from the Cookie header, if the session cookie is valid. */
  readSession(cookieHeaderValue: string | undefined): SessionUser | undefined {
    if (!this.enabled) return undefined;
    const session = unseal<SessionPayload>(
      this.secret,
      readCookie(cookieHeaderValue, AUTH_SESSION_COOKIE),
    );
    if (!session || typeof session.uid !== 'string') return undefined;
    return {
      id: session.uid,
      email: session.email ?? null,
      name: session.name ?? null,
      roles: Array.isArray(session.roles)
        ? realmRolesOf(session.roles)
        : session.admin === true
          ? ['admin']
          : [],
    };
  }

  /** The fake provider's "Sign in" button: back to the callback with a code it will accept. */
  mockAuthorize(query: {
    state?: unknown;
    email?: unknown;
    [role: string]: unknown;
  }): string {
    const email = EmailSchema.safeParse(query.email);
    const state = typeof query.state === 'string' ? query.state : '';
    if (!email.success || !state) {
      const params = new URLSearchParams({ state, invalid: '1' });
      return `/api/auth/mock?${params.toString()}`;
    }
    const code: MockCode = {
      state,
      email: email.data.toLowerCase(),
      roles: realmRolesOf(
        REALM_ROLES.filter((r) => query[r] === 'on' || query[r] === 'true'),
      ),
    };
    const params = new URLSearchParams({
      code: seal(this.secret, { ...code }, MOCK_CODE_MS),
      state,
    });
    return `/api/auth/callback?${params.toString()}`;
  }

  private mockIdentity(code: string, state: string) {
    const mock = unseal<MockCode>(this.secret, code);
    if (!mock || !sameString(mock.state, state)) {
      throw new Error('mock code rejected');
    }
    return {
      sub: `mock:${mock.email}`,
      email: mock.email,
      emailVerified: true,
      name: mock.email.split('@')[0],
      roles: Array.isArray(mock.roles) ? realmRolesOf(mock.roles) : [],
    };
  }

  private async keycloakIdentity(code: string, login: LoginState) {
    const { id, idToken, access } = await this.oidc!.exchange(
      code,
      login.verifier,
      login.nonce,
    );
    const roles = realmRoles(id, access);
    return {
      sub: id.sub,
      email: claimString(id, 'email'),
      emailVerified: id.email_verified === true,
      name: personName(id),
      roles: realmRolesOf(roles),
      idToken,
    };
  }

  private stateCookie(value: string, maxAgeMs = STATE_MS): string {
    return this.cookie(AUTH_STATE_COOKIE, value, maxAgeMs, AUTH_COOKIE_PATH);
  }

  private cookie(name: string, value: string, maxAgeMs: number, path = '/') {
    return cookieHeader(name, value, {
      maxAgeSeconds: Math.floor(maxAgeMs / 1000),
      secure: this.admin.secureCookie,
      path,
    });
  }
}

/** The person's name for the order form; the username is the email in this realm, so never that. */
export function personName(claims: Claims): string | null {
  const parts = [
    claimString(claims, 'given_name'),
    claimString(claims, 'family_name'),
  ];
  return (
    claimString(claims, 'name') ?? (parts.filter(Boolean).join(' ') || null)
  );
}

function claimString(claims: Claims, name: string): string | null {
  const value = claims[name];
  return typeof value === 'string' && value ? value : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
