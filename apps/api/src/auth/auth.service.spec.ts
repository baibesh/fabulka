import type { ConfigService } from '@nestjs/config';
import { AdminAuthService } from '../admin/admin-auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, personName } from './auth.service';

function config(env: Record<string, string>) {
  return {
    get: (key: string, fallback: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
}

function setup(env: Record<string, string> = {}) {
  const values = { AUTH_MOCK: 'true', AUTH_SECRET: 'test-auth', ...env };
  const prisma = {
    user: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    book: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const admin = new AdminAuthService(config({ ADMIN_SECRET: 'a', ...values }));
  const auth = new AuthService(
    config(values),
    prisma as unknown as PrismaService,
    admin,
  );
  return { auth, prisma, admin };
}

/** The cookie values a list of Set-Cookie headers leaves, as a Cookie header. */
function jar(cookies: string[]): string {
  return cookies
    .map((c) => c.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

async function signIn(
  auth: AuthService,
  options: { admin?: boolean; returnTo?: string } = {},
) {
  const login = await auth.login({
    return: options.returnTo ?? '/my',
    key: 'visitor-1',
    lang: 'kk',
  });
  const state = new URL(login.location, 'http://x').searchParams.get('state')!;
  const callbackUrl = auth.mockAuthorize({
    state,
    email: 'Parent@Example.com',
    admin: options.admin ? 'on' : undefined,
  });
  const params = new URL(callbackUrl, 'http://x').searchParams;
  return auth.callback(
    { code: params.get('code'), state: params.get('state') },
    jar(login.cookies),
  );
}

describe('AuthService (mock provider)', () => {
  it('signs in, moves the visitor’s anonymous books and orders and returns', async () => {
    const { auth, prisma } = setup();
    const result = await signIn(auth);
    expect(result.location).toBe('/my');
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sub: 'mock:parent@example.com' } }),
    );
    expect(prisma.book.updateMany).toHaveBeenCalledWith({
      where: { clientKey: 'visitor-1', userId: null },
      data: { userId: 'user-1' },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { clientKey: 'visitor-1', userId: null },
      data: { userId: 'user-1' },
    });
    const user = auth.readSession(jar(result.cookies));
    expect(user).toEqual({
      id: 'user-1',
      email: 'parent@example.com',
      name: 'parent',
      admin: false,
    });
    expect(result.cookies.join('\n')).not.toContain('admin_session=');
  });

  it('opens the admin for the admin role', async () => {
    const { auth, admin } = setup();
    const result = await signIn(auth, { admin: true });
    const token = /admin_session=([^;]+)/.exec(result.cookies.join(';'))![1];
    expect(admin.verify(token)).toBe(true);
    expect(
      auth.me(auth.readSession(jar(result.cookies)) ?? null).user?.admin,
    ).toBe(true);
  });

  it('sends a foreign return path home', async () => {
    const { auth } = setup();
    expect((await signIn(auth, { returnTo: '//evil.com' })).location).toBe('/');
  });

  it('returns with ?auth=error on a wrong state or a missing cookie', async () => {
    const { auth } = setup();
    const login = await auth.login({ return: '/books/1?lang=ru' });
    const state = new URL(login.location, 'http://x').searchParams.get(
      'state',
    )!;
    const code = new URL(
      auth.mockAuthorize({ state, email: 'a@b.kz' }),
      'http://x',
    ).searchParams.get('code');
    const wrong = await auth.callback(
      { code, state: 'other' },
      jar(login.cookies),
    );
    expect(wrong.location).toBe('/books/1?lang=ru&auth=error');
    expect((await auth.callback({ code, state }, undefined)).location).toBe(
      '/?auth=error',
    );
    const denied = await auth.callback(
      { error: 'access_denied', state },
      jar(login.cookies),
    );
    expect(denied.location).toBe('/books/1?lang=ru&auth=error');
  });

  it('does not accept a session signed with another secret', async () => {
    const { auth } = setup();
    const result = await signIn(auth);
    const other = setup({ AUTH_SECRET: 'other' }).auth;
    expect(other.readSession(jar(result.cookies))).toBeUndefined();
  });

  it('logs out by clearing the cookies', async () => {
    const { auth } = setup();
    const result = await signIn(auth, { admin: true });
    const out = await auth.logout(jar(result.cookies));
    expect(out.url).toBe('/');
    expect(out.cookies.join('\n')).toMatch(/fabulka_session=; .*Max-Age=0/);
    expect(out.cookies.join('\n')).toMatch(/admin_session=; .*Max-Age=0/);
  });

  it('refuses the mock in production and is off without configuration', () => {
    const prod = setup({ NODE_ENV: 'production' }).auth;
    expect(prod.mock).toBe(false);
    expect(prod.enabled).toBe(false);
    expect(setup({ AUTH_MOCK: 'false' }).auth.me(null)).toEqual({
      enabled: false,
      user: null,
    });
  });

  it('starts a Keycloak login with PKCE and the language', async () => {
    const issuer = 'https://auth.example.com/realms/fabulka';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
          token_endpoint: `${issuer}/protocol/openid-connect/token`,
          jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        }),
      ),
    );
    const { auth } = setup({
      AUTH_MOCK: 'false',
      KEYCLOAK_ISSUER: issuer,
      KEYCLOAK_CLIENT_ID: 'fabulka-web',
      KEYCLOAK_CLIENT_SECRET: 'secret',
      PUBLIC_URL: 'https://fabulka.com/',
    });
    const login = await auth.login({ return: '/my', lang: 'kk' });
    const url = new URL(login.location);
    expect(url.origin + url.pathname).toBe(
      `${issuer}/protocol/openid-connect/auth`,
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://fabulka.com/api/auth/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('ui_locales')).toBe('kk');
    expect(login.cookies[0]).toMatch(/^fabulka_auth=.+Path=\/api\/auth/);
    fetchMock.mockRestore();
  });
});

describe('personName', () => {
  it('takes the name claim, else given and family names, never the username', () => {
    expect(personName({ sub: 's', name: 'Айгерим Сериккызы' })).toBe(
      'Айгерим Сериккызы',
    );
    expect(
      personName({ sub: 's', given_name: 'Айгерим', family_name: 'Сериккызы' }),
    ).toBe('Айгерим Сериккызы');
    expect(personName({ sub: 's', given_name: 'Айгерим' })).toBe('Айгерим');
    expect(
      personName({ sub: 's', preferred_username: 'mama@example.com' }),
    ).toBeNull();
  });
});
