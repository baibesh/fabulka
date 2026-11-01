import {
  claimsProblem,
  clientKeyParam,
  codeChallenge,
  randomToken,
  realmRoles,
  safeReturn,
  uiLocale,
  withAuthParam,
} from './auth.util';

describe('safeReturn', () => {
  it('keeps a path on this site', () => {
    expect(safeReturn('/my')).toBe('/my');
    expect(safeReturn('/books/abc?lang=kk#top')).toBe('/books/abc?lang=kk#top');
    expect(safeReturn('/admin')).toBe('/admin');
  });

  it('falls back to / for anything that could leave the site', () => {
    for (const value of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'evil.com',
      'javascript:alert(1)',
      '/my\nSet-Cookie: x=1',
      '',
      undefined,
      ['/my'],
      `/${'a'.repeat(600)}`,
    ]) {
      expect(safeReturn(value)).toBe('/');
    }
  });
});

describe('withAuthParam', () => {
  it('adds ?auth= keeping the query and the hash', () => {
    expect(withAuthParam('/my', 'error')).toBe('/my?auth=error');
    expect(withAuthParam('/books/1?lang=kk', 'error')).toBe(
      '/books/1?lang=kk&auth=error',
    );
    expect(withAuthParam('/catalog#top', 'error')).toBe(
      '/catalog?auth=error#top',
    );
  });
});

describe('login parameters', () => {
  it('passes only known languages and plain visitor keys', () => {
    expect(uiLocale('kk')).toBe('kk');
    expect(uiLocale('de')).toBe('de');
    expect(uiLocale('fr')).toBeUndefined();
    expect(clientKeyParam('3f1c2a9e-0b7d-4c55-9a7e-1b2c3d4e5f60')).toBe(
      '3f1c2a9e-0b7d-4c55-9a7e-1b2c3d4e5f60',
    );
    expect(clientKeyParam('a b')).toBeUndefined();
    expect(clientKeyParam('x'.repeat(201))).toBeUndefined();
  });

  it('makes an S256 challenge from a random verifier', () => {
    const verifier = randomToken(48);
    expect(verifier).toMatch(/^[\w-]{64}$/);
    expect(codeChallenge(verifier)).toMatch(/^[\w-]{43}$/);
    expect(codeChallenge(verifier)).toBe(codeChallenge(verifier));
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('realmRoles', () => {
  it('reads realm_access.roles from the access token', () => {
    const roles = realmRoles(
      { sub: 'u' },
      { realm_access: { roles: ['offline_access', 'admin'] } },
    );
    expect(roles.has('admin')).toBe(true);
  });

  it('reads roles a mapper put in the ID token, flat or nested', () => {
    expect(realmRoles({ roles: ['admin'] }).has('admin')).toBe(true);
    expect(
      realmRoles({ realm_access: { roles: ['admin'] } }, undefined).has(
        'admin',
      ),
    ).toBe(true);
  });

  it('finds nothing in odd shapes', () => {
    const roles = realmRoles(
      { realm_access: { roles: 'admin' } },
      { roles: [1, null] },
      undefined,
    );
    expect(roles.size).toBe(0);
  });
});

describe('claimsProblem', () => {
  const issuer = 'https://auth.fabulka.com/realms/fabulka';
  const now = Date.UTC(2026, 9, 31);
  const base = {
    iss: issuer,
    sub: 'user-1',
    aud: 'fabulka-web',
    exp: now / 1000 + 300,
    nonce: 'n1',
  };
  const expected = { issuer, audience: 'fabulka-web', nonce: 'n1', now };

  it('accepts matching claims', () => {
    expect(claimsProblem(base, expected)).toBeNull();
    expect(
      claimsProblem(
        { ...base, aud: ['account', 'fabulka-web'], azp: 'fabulka-web' },
        expected,
      ),
    ).toBeNull();
  });

  it('names what is wrong', () => {
    expect(claimsProblem({ ...base, iss: 'https://evil' }, expected)).toBe(
      'issuer',
    );
    expect(claimsProblem({ ...base, exp: now / 1000 - 3600 }, expected)).toBe(
      'expired',
    );
    expect(claimsProblem({ ...base, aud: 'other' }, expected)).toBe('audience');
    expect(claimsProblem({ ...base, nonce: 'n2' }, expected)).toBe('nonce');
    expect(claimsProblem({ ...base, sub: '' }, expected)).toBe('subject');
    expect(
      claimsProblem({ ...base, aud: ['fabulka-web', 'x'], azp: 'x' }, expected),
    ).toBe('authorized party');
  });
});
