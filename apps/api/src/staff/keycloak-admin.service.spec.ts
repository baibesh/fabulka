import type { ConfigService } from '@nestjs/config';
import type { MailService } from '../mail/mail.service';
import {
  INVITE_LIFESPAN_S,
  KeycloakAdminService,
} from './keycloak-admin.service';

const ISSUER = 'https://auth.example.com/realms/fabulka';
const ADMIN = 'https://auth.example.com/admin/realms/fabulka';

function service(env: Record<string, string> = {}) {
  const values: Record<string, string> = {
    KEYCLOAK_ISSUER: ISSUER,
    KEYCLOAK_STAFF_CLIENT_ID: 'fabulka-staff',
    KEYCLOAK_STAFF_CLIENT_SECRET: 'staff-secret',
    PUBLIC_URL: 'https://fabulka.example',
    ...env,
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const keycloak = new KeycloakAdminService(
    {
      get: (key: string, fallback: string) => values[key] ?? fallback,
    } as unknown as ConfigService,
    mail as unknown as MailService,
  );
  return { keycloak, mail };
}

type Call = { url: string; method: string; body?: string; auth?: string };

/** A fake Keycloak: answers by method and path, records every call. */
function fakeKeycloak(
  routes: Record<string, (call: Call) => { status: number; json?: unknown }>,
) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation((input, init = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      body:
        typeof init.body === 'string'
          ? init.body
          : init.body instanceof URLSearchParams
            ? init.body.toString()
            : undefined,
      auth: headers.authorization,
    };
    calls.push(call);
    const path = url.split('?')[0];
    const route = routes[`${call.method} ${path}`];
    const { status, json } = route ? route(call) : { status: 404 };
    return Promise.resolve(
      new Response(json === undefined ? null : JSON.stringify(json), {
        status,
      }),
    );
  });
  return calls;
}

const token = () => ({
  status: 200,
  json: { access_token: 'svc-token', expires_in: 300 },
});

afterEach(() => jest.restoreAllMocks());

describe('KeycloakAdminService', () => {
  it('is off without the staff client, and says the email was not sent', async () => {
    const { keycloak } = service({ KEYCLOAK_STAFF_CLIENT_SECRET: '' });
    expect(keycloak.mode).toBe('off');
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    expect(await keycloak.invite('a@example.com', 'A')).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the email in memory with AUTH_MOCK (E2E), never in production', async () => {
    const { keycloak, mail } = service({ AUTH_MOCK: 'true' });
    expect(keycloak.mode).toBe('mock');
    expect(await keycloak.invite('a@example.com', 'A')).toBe('sent');
    const [to, sent] = mail.send.mock.calls[0] as [string, { subject: string }];
    expect(to).toBe('a@example.com');
    expect(sent.subject).toContain('staff invitation');
    expect(
      service({ AUTH_MOCK: 'true', NODE_ENV: 'production' }).keycloak.mode,
    ).toBe('keycloak');
  });

  it('creates a new user and sends the set-up email back to the admin sign-in', async () => {
    let created = false;
    const calls = fakeKeycloak({
      [`POST ${ISSUER}/protocol/openid-connect/token`]: token,
      [`GET ${ADMIN}/users`]: () => ({
        status: 200,
        json: created
          ? [{ id: 'u1', email: 'anna@example.com', emailVerified: false }]
          : [],
      }),
      [`POST ${ADMIN}/users`]: () => {
        created = true;
        return { status: 201 };
      },
      [`PUT ${ADMIN}/users/u1/execute-actions-email`]: () => ({ status: 204 }),
    });
    const { keycloak } = service();
    expect(await keycloak.invite('anna@example.com', 'Anna Schmidt')).toBe(
      'sent',
    );

    const tokenCall = calls[0];
    expect(tokenCall.body).toContain('grant_type=client_credentials');
    expect(tokenCall.body).toContain('client_id=fabulka-staff');
    const create = calls.find(
      (c) => c.method === 'POST' && c.url === `${ADMIN}/users`,
    )!;
    expect(JSON.parse(create.body!)).toEqual({
      username: 'anna@example.com',
      email: 'anna@example.com',
      enabled: true,
      emailVerified: false,
      firstName: 'Anna',
      lastName: 'Schmidt',
    });
    expect(create.auth).toBe('Bearer svc-token');
    const send = calls.find((c) => c.method === 'PUT')!;
    expect(JSON.parse(send.body!)).toEqual([
      'UPDATE_PASSWORD',
      'CONFIGURE_TOTP',
      'VERIFY_EMAIL',
    ]);
    const query = new URL(send.url).searchParams;
    expect(query.get('client_id')).toBe('fabulka-web');
    expect(query.get('redirect_uri')).toBe(
      'https://fabulka.example/admin/login',
    );
    expect(query.get('lifespan')).toBe(String(INVITE_LIFESPAN_S));
    // One token for all the calls.
    expect(calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1);
  });

  it('asks an existing user only for what they lack, and nothing when they lack nothing', async () => {
    const credentials: { type: string }[] = [{ type: 'password' }];
    const calls = fakeKeycloak({
      [`POST ${ISSUER}/protocol/openid-connect/token`]: token,
      [`GET ${ADMIN}/users`]: () => ({
        status: 200,
        json: [{ id: 'u2', email: 'cust@example.com', emailVerified: true }],
      }),
      [`GET ${ADMIN}/users/u2/credentials`]: () => ({
        status: 200,
        json: credentials,
      }),
      [`PUT ${ADMIN}/users/u2/execute-actions-email`]: () => ({ status: 204 }),
    });
    const { keycloak } = service();
    expect(await keycloak.invite('cust@example.com', '')).toBe('sent');
    expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body!)).toEqual([
      'CONFIGURE_TOTP',
    ]);
    expect(
      calls.some((c) => c.method === 'POST' && c.url === `${ADMIN}/users`),
    ).toBe(false);

    credentials.push({ type: 'otp' });
    expect(await keycloak.invite('cust@example.com', '')).toBe('not_needed');
  });

  it('answers failed, without throwing, when Keycloak refuses', async () => {
    fakeKeycloak({
      [`POST ${ISSUER}/protocol/openid-connect/token`]: () => ({ status: 401 }),
    });
    expect(await service().keycloak.invite('a@example.com', '')).toBe('failed');
  });
});
