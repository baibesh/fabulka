import type { ConfigService } from '@nestjs/config';
import { AdminAuthService, readCookie } from './admin-auth.service';

function auth(env: Record<string, string> = {}) {
  const values: Record<string, string> = {
    ADMIN_EMAIL: 'Admin@Fabulka.com',
    ADMIN_PASSWORD: 'correct horse',
    ADMIN_SECRET: 'test-secret',
    ADMIN_PASSWORD_LOGIN: 'true',
    ...env,
  };
  return new AdminAuthService({
    get: (key: string, fallback: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
}

describe('AdminAuthService', () => {
  it('signs in with the configured email (any case) and password', () => {
    const service = auth();
    const token = service.login(
      'admin@fabulka.com',
      'correct horse',
      '1.1.1.1',
    );
    expect(service.verify(token)).toEqual({
      roles: ['admin'],
      who: 'admin@fabulka.com',
    });
  });

  it('refuses a wrong password', () => {
    expect(() => auth().login('admin@fabulka.com', 'wrong', '1.1.1.1')).toThrow(
      'Неверная почта или пароль',
    );
  });

  it('rejects a tampered or expired token', () => {
    const service = auth();
    const token = service.login(
      'admin@fabulka.com',
      'correct horse',
      '1.1.1.1',
    );
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ r: ['admin'], w: 'x', exp: Date.now() + 1e9 }),
    ).toString('base64url');
    expect(service.verify(`${forged}.${signature}`)).toBeNull();
    expect(service.verify(`${body}.${signature}x`)).toBeNull();
    expect(service.verify(undefined)).toBeNull();
    const expired = service.issue(['admin'], null, Date.now() - 13 * 3600_000);
    expect(service.verify(expired)).toBeNull();
  });

  it('does not accept a token signed with another secret', () => {
    const token = auth().login('admin@fabulka.com', 'correct horse', '1.1.1.1');
    expect(auth({ ADMIN_SECRET: 'other' }).verify(token)).toBeNull();
  });

  it('makes an address wait after ten wrong passwords', () => {
    const service = auth();
    for (let i = 0; i < 10; i++) {
      expect(() =>
        service.login('admin@fabulka.com', 'nope', '2.2.2.2'),
      ).toThrow();
    }
    expect(() =>
      service.login('admin@fabulka.com', 'correct horse', '2.2.2.2'),
    ).toThrow('Слишком много попыток');
    expect(() =>
      service.login('admin@fabulka.com', 'correct horse', '3.3.3.3'),
    ).not.toThrow();
  });

  it('refuses the password sign-in unless ADMIN_PASSWORD_LOGIN=true', () => {
    const service = auth({ ADMIN_PASSWORD_LOGIN: 'false' });
    expect(service.passwordLoginReady).toBe(false);
    expect(() =>
      service.login('admin@fabulka.com', 'correct horse', '1.1.1.1'),
    ).toThrow('Вход по паролю выключен');
  });

  it('issues sessions for Keycloak admins without a password configured', () => {
    const service = auth({
      ADMIN_PASSWORD_LOGIN: 'false',
      ADMIN_EMAIL: '',
      ADMIN_PASSWORD: '',
      ADMIN_SECRET: '',
      AUTH_SECRET: 'auth-secret',
      NODE_ENV: 'production',
    });
    expect(service.verify(service.issue())).toEqual({
      roles: ['admin'],
      who: null,
    });
    expect(() =>
      auth({ NODE_ENV: 'production', ADMIN_SECRET: '' }).issue(),
    ).toThrow('not configured');
  });

  it('is off without credentials', () => {
    expect(() =>
      auth({ ADMIN_PASSWORD: '' }).login('admin@fabulka.com', '', '1.1.1.1'),
    ).toThrow('not configured');
  });

  it('is Secure by default in production and off there without a secret', () => {
    const prod = auth({ NODE_ENV: 'production' });
    expect(prod.cookie('t')).toContain('Secure');
    expect(() =>
      auth({ NODE_ENV: 'production', ADMIN_SECRET: '' }).login(
        'admin@fabulka.com',
        'correct horse',
        '1.1.1.1',
      ),
    ).toThrow('not configured');
  });

  it('sets an httpOnly cookie, Secure only when asked', () => {
    expect(auth().cookie('t')).toContain('HttpOnly');
    expect(auth().cookie('t')).not.toContain('Secure');
    expect(auth({ ADMIN_COOKIE_SECURE: 'true' }).cookie('t')).toContain(
      'Secure',
    );
  });
});

describe('AdminAuthService roles', () => {
  it('keeps the roles and who in the session', () => {
    const service = auth();
    expect(service.verify(service.issue(['seo'], 'seo@x.kz'))).toEqual({
      roles: ['seo'],
      who: 'seo@x.kz',
    });
  });

  it('refuses a session with no admin role, and unknown roles', () => {
    const service = auth();
    expect(service.verify(service.issue([], null))).toBeNull();
    expect(service.verify(service.issue(['owner' as never], null))).toBeNull();
  });

  it('does not take another signed token of the API (same secret) for a session', () => {
    const service = auth({ ADMIN_SECRET: 'shared' });
    // A token sealed with the bare secret, as the site session cookie is.
    const { seal } =
      jest.requireActual<typeof import('../common/signed')>('../common/signed');
    const other = seal('shared', { r: ['admin'] }, 60_000);
    expect(service.verify(other)).toBeNull();
  });

  it('still accepts a session made before roles, as admin', () => {
    const service = auth();
    const expires = Date.now() + 60_000;
    const { createHmac } =
      jest.requireActual<typeof import('node:crypto')>('node:crypto');
    const signature = createHmac('sha256', 'test-secret')
      .update(`admin.${expires}`)
      .digest('base64url');
    expect(service.verify(`${expires}.${signature}`)).toEqual({
      roles: ['admin'],
      who: null,
    });
  });
});

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; admin_session=x.y; b=2', 'admin_session')).toBe(
      'x.y',
    );
    expect(readCookie(undefined, 'admin_session')).toBeUndefined();
  });
});
