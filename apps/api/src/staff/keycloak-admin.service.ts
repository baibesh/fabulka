import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InviteEmailStatus } from '@fabulka/shared';
import { MailService } from '../mail/mail.service';

/** How long the link in Keycloak's set-up email works: three days. */
export const INVITE_LIFESPAN_S = 3 * 24 * 60 * 60;
const TIMEOUT_MS = 10_000;

/** What a new staff member sets up from the email: a password, an authenticator app, their email. */
export const NEW_USER_ACTIONS = [
  'UPDATE_PASSWORD',
  'CONFIGURE_TOTP',
  'VERIFY_EMAIL',
] as const;

interface KeycloakUser {
  id: string;
  email?: string;
  emailVerified?: boolean;
}

/**
 * Invites staff through the Keycloak Admin REST API, so nobody opens the Keycloak console: finds or
 * creates the Keycloak user by email and has Keycloak send its execute-actions email (set a
 * password, set up an authenticator app, verify the email), whose link comes back to the admin's
 * sign-in page.
 *
 * It signs in as the confidential client KEYCLOAK_STAFF_CLIENT_ID (fabulka-staff) with
 * KEYCLOAK_STAFF_CLIENT_SECRET, a service account with only realm-management manage-users,
 * view-users and query-users (deploy/keycloak/configure.sh creates it). Without them nothing is
 * sent (`not_configured`); with AUTH_MOCK=true (E2E, never production) the email is only kept in
 * memory like the site's other mails (GET /api/test/mails).
 *
 * It never disables a Keycloak user: staff may be customers too, so disabling someone in Team only
 * takes away their admin, in our database.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  readonly mode: 'keycloak' | 'mock' | 'off';
  private readonly issuer: string;
  private readonly adminBase: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webClientId: string;
  private readonly loginUrl: string;
  private token?: { value: string; until: number };

  constructor(
    config: ConfigService,
    private readonly mail: MailService,
  ) {
    const production = config.get('NODE_ENV') === 'production';
    this.issuer = config.get<string>('KEYCLOAK_ISSUER', '').replace(/\/+$/, '');
    this.clientId = config.get<string>('KEYCLOAK_STAFF_CLIENT_ID', '');
    this.clientSecret = config.get<string>('KEYCLOAK_STAFF_CLIENT_SECRET', '');
    this.webClientId = config.get<string>('KEYCLOAK_CLIENT_ID', 'fabulka-web');
    const publicUrl = config
      .get<string>('PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    this.loginUrl = `${publicUrl}/admin/login`;
    // https://auth.example.com/realms/fabulka → https://auth.example.com/admin/realms/fabulka
    const match = /^(.*)\/realms\/([^/]+)$/.exec(this.issuer);
    this.adminBase = match ? `${match[1]}/admin/realms/${match[2]}` : '';
    if (config.get('AUTH_MOCK', 'false') === 'true' && !production) {
      this.mode = 'mock';
    } else if (this.adminBase && this.clientId && this.clientSecret) {
      this.mode = 'keycloak';
    } else {
      this.mode = 'off';
      this.logger.log(
        'KEYCLOAK_STAFF_CLIENT_ID/SECRET not set: staff invites save the row but send no email',
      );
    }
  }

  /**
   * Gets `email` ready to sign in as staff and sends Keycloak's set-up email. Never throws: a
   * refusal is logged and answered `failed`, so the staff row is kept either way.
   */
  async invite(email: string, name: string): Promise<InviteEmailStatus> {
    if (this.mode === 'off') return 'not_configured';
    if (this.mode === 'mock') return this.mockInvite(email);
    try {
      let user = await this.findUser(email);
      let actions: string[];
      if (!user) {
        user = await this.createUser(email, name);
        actions = [...NEW_USER_ACTIONS];
      } else {
        actions = await this.missingActions(user);
      }
      if (!actions.length) return 'not_needed';
      const query = new URLSearchParams({
        client_id: this.webClientId,
        redirect_uri: this.loginUrl,
        lifespan: String(INVITE_LIFESPAN_S),
      });
      await this.call(
        `/users/${encodeURIComponent(user.id)}/execute-actions-email?${query.toString()}`,
        { method: 'PUT', body: JSON.stringify(actions) },
      );
      return 'sent';
    } catch (error) {
      this.logger.warn(
        `staff invite email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'failed';
    }
  }

  private async findUser(email: string): Promise<KeycloakUser | undefined> {
    const query = new URLSearchParams({ email, exact: 'true' });
    const response = await this.call(`/users?${query.toString()}`);
    const users = (await response.json()) as KeycloakUser[];
    return users.find((u) => u.email?.toLowerCase() === email) ?? users[0];
  }

  private async createUser(email: string, name: string): Promise<KeycloakUser> {
    const [firstName, ...rest] = name.trim().split(/\s+/).filter(Boolean);
    const body: Record<string, unknown> = {
      username: email,
      email,
      enabled: true,
      emailVerified: false,
    };
    if (firstName) body.firstName = firstName;
    if (rest.length) body.lastName = rest.join(' ');
    await this.call('/users', { method: 'POST', body: JSON.stringify(body) }, [
      409, // made meanwhile: find it below
    ]);
    const user = await this.findUser(email);
    if (!user) throw new Error('the new Keycloak user was not found');
    return user;
  }

  /** What an existing Keycloak user still has to set up for the admin. */
  private async missingActions(user: KeycloakUser): Promise<string[]> {
    const response = await this.call(
      `/users/${encodeURIComponent(user.id)}/credentials`,
    );
    const types = new Set(
      ((await response.json()) as { type?: string }[]).map((c) => c.type),
    );
    const actions: string[] = [];
    if (!types.has('password')) actions.push('UPDATE_PASSWORD');
    if (!types.has('otp')) actions.push('CONFIGURE_TOTP');
    if (!user.emailVerified) actions.push('VERIFY_EMAIL');
    return actions;
  }

  private async call(
    path: string,
    init: RequestInit = {},
    okStatuses: number[] = [],
  ): Promise<Response> {
    const response = await fetch(`${this.adminBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok && !okStatuses.includes(response.status)) {
      const method = init.method ?? 'GET';
      throw new Error(
        `Keycloak ${method} ${path.split('?')[0]} answered ${response.status}`,
      );
    }
    return response;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const response = await fetch(
      `${this.issuer}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Keycloak token answered ${response.status}`);
    }
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) throw new Error('Keycloak gave no access token');
    const seconds = Math.max(10, (body.expires_in ?? 60) - 30);
    this.token = {
      value: body.access_token,
      until: Date.now() + seconds * 1000,
    };
    return body.access_token;
  }

  /** E2E: the email Keycloak would send, kept with the site's test mails. */
  private async mockInvite(email: string): Promise<InviteEmailStatus> {
    const actions = NEW_USER_ACTIONS.join(', ');
    await this.mail.send(email, {
      subject: 'Fabulka staff invitation (test Keycloak)',
      text: `Set up your account (${actions}), then sign in at ${this.loginUrl}`,
      html: `<p>Set up your account (${actions}), then <a href="${this.loginUrl}">sign in</a>.</p>`,
    });
    return 'sent';
  }
}
