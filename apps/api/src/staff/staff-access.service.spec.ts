import { ADMIN_PERMISSIONS, permissionsOf } from '@fabulka/shared';
import { ACCESS_CACHE_MS, StaffAccessService } from './staff-access.service';
import { fakeStaffPrisma, staffRow } from './staff.testing';

const person = (over: Record<string, unknown> = {}) => ({
  sub: 'kc-1',
  email: 'Anna@Example.com',
  emailVerified: true,
  name: 'Anna',
  realmRoles: [] as string[],
  ...over,
});

function setup(
  rows = [
    staffRow({
      email: 'anna@example.com',
      status: 'invited',
      roles: ['country_manager'],
      countries: ['DE'],
    }),
  ],
) {
  const { prisma, service } = fakeStaffPrisma(rows);
  return { prisma, access: new StaffAccessService(service) };
}

describe('StaffAccessService.signIn', () => {
  it('links an invited row by email on the first sign-in and activates it', async () => {
    const { prisma, access } = setup();
    const identity = await access.signIn(person());
    expect(identity).toEqual({
      email: 'anna@example.com',
      sub: 'kc-1',
      realm: [],
    });
    const row = prisma.staffMember.rows[0];
    expect(row).toMatchObject({ keycloakId: 'kc-1', status: 'active' });
    expect(row.lastLoginAt).toBeInstanceOf(Date);
    const session = await access.resolve(identity);
    expect(session?.roles).toEqual(['country_manager']);
    expect(session?.countries).toEqual(['DE']);
    expect(permissionsOf(session!)).toEqual([
      'dashboard',
      'orders',
      'catalog',
      'examples',
      'reference',
      'audit',
    ]);
  });

  it('finds the row by Keycloak id even when the email changed', async () => {
    const { access } = setup([
      staffRow({
        email: 'old@example.com',
        keycloakId: 'kc-1',
        roles: ['seo'],
      }),
    ]);
    const identity = await access.signIn(person({ email: 'new@example.com' }));
    expect(identity?.sub).toBe('kc-1');
    expect((await access.resolve(identity))?.roles).toEqual(['seo']);
  });

  it('does not link by an unverified email, nor a row linked to another Keycloak user', async () => {
    expect(
      await setup().access.signIn(person({ emailVerified: false })),
    ).toBeNull();
    const taken = setup([
      staffRow({
        email: 'anna@example.com',
        keycloakId: 'kc-other',
        roles: ['seo'],
      }),
    ]);
    expect(await taken.access.signIn(person())).toBeNull();
  });

  it('gives nobody without a row or a realm role the admin', async () => {
    const { prisma, access } = setup([]);
    expect(await access.signIn(person())).toBeNull();
    expect(prisma.staffMember.rows).toHaveLength(0);
  });

  it('keeps a disabled person out', async () => {
    const { access } = setup([
      staffRow({
        email: 'anna@example.com',
        status: 'disabled',
        roles: ['seo'],
      }),
    ]);
    expect(await access.signIn(person())).toBeNull();
  });

  it('creates an active row for a realm role holder, with that role', async () => {
    const { prisma, access } = setup([]);
    const identity = await access.signIn(
      person({ realmRoles: ['offline_access', 'seo'] }),
    );
    expect(identity?.realm).toEqual(['seo']);
    expect(prisma.staffMember.rows[0]).toMatchObject({
      email: 'anna@example.com',
      keycloakId: 'kc-1',
      status: 'active',
      roles: ['seo'],
      realmRoles: ['seo'],
      createdBy: 'keycloak',
    });
  });

  it('refreshes the row of a realm admin: adds the role, re-activates, never strips it', async () => {
    const { prisma, access } = setup([
      staffRow({
        email: 'anna@example.com',
        status: 'disabled',
        roles: ['seo'],
      }),
    ]);
    const identity = await access.signIn(person({ realmRoles: ['admin'] }));
    expect(prisma.staffMember.rows[0]).toMatchObject({
      status: 'active',
      roles: ['seo', 'admin'],
      realmRoles: ['admin'],
    });
    const session = await access.resolve(identity);
    expect(session?.roles[0]).toBe('admin');
    expect(permissionsOf(session!)).toEqual([...ADMIN_PERMISSIONS]);
  });

  it('takes away a role whose realm role was removed in Keycloak', async () => {
    const { prisma, access } = setup([
      staffRow({
        email: 'anna@example.com',
        keycloakId: 'kc-1',
        roles: ['admin', 'country_manager'],
        countries: ['DE'],
        realmRoles: ['admin'],
      }),
    ]);
    await access.signIn(person());
    expect(prisma.staffMember.rows[0].roles).toEqual(['country_manager']);
  });
});

describe('StaffAccessService.resolve', () => {
  it('keeps the realm admin a superadmin with no row at all, and the emergency login too', async () => {
    const { access } = setup([]);
    const owner = await access.resolve({
      email: 'owner@example.com',
      sub: 'kc-owner',
      realm: ['admin'],
    });
    expect(owner?.roles).toEqual(['admin']);
    const emergency = await access.resolve({
      email: 'admin@example.com',
      sub: null,
      realm: [],
      emergency: true,
    });
    expect(emergency?.global).toContain('team');
  });

  it('lets a realm seo holder without a row into SEO only', async () => {
    const { access } = setup([]);
    const session = await access.resolve({
      email: 'seo@example.com',
      sub: null,
      realm: ['seo'],
    });
    expect(permissionsOf(session!)).toEqual(['seo']);
  });

  it('sees a disabled row or changed roles within the cache window, at once after invalidate()', async () => {
    const { prisma, access } = setup([
      staffRow({
        email: 'anna@example.com',
        keycloakId: 'kc-1',
        roles: ['seo'],
      }),
    ]);
    const identity = { email: 'anna@example.com', sub: 'kc-1', realm: [] };
    const now = Date.now();
    expect(await access.resolve(identity, now)).not.toBeNull();
    prisma.staffMember.rows[0].status = 'disabled';
    // Cached for a few seconds…
    expect(await access.resolve(identity, now + 1000)).not.toBeNull();
    // …then read again,
    expect(
      await access.resolve(identity, now + ACCESS_CACHE_MS + 1),
    ).toBeNull();
    // and a Team write clears the cache straight away.
    prisma.staffMember.rows[0].status = 'active';
    access.invalidate();
    expect(
      await access.resolve(identity, now + ACCESS_CACHE_MS + 2),
    ).not.toBeNull();
  });

  it('reads role definitions from the database: a custom role limits the sections', async () => {
    const { prisma, access } = setup([
      staffRow({
        email: 'o@example.com',
        keycloakId: 'kc-o',
        roles: ['orders_only'],
      }),
    ]);
    prisma.staffRole.rows.push({
      key: 'orders_only',
      name: 'Orders',
      rights: ['orders'],
      scoped: false,
      locked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const session = await access.resolve({
      email: 'o@example.com',
      sub: 'kc-o',
      realm: [],
    });
    expect(permissionsOf(session!)).toEqual(['orders']);
  });

  it('gives nothing to an invited row, a row without roles, or a scoped role without countries', async () => {
    const { access } = setup([
      staffRow({ email: 'a@example.com', status: 'invited', roles: ['seo'] }),
      staffRow({ email: 'b@example.com', roles: [] }),
      staffRow({
        email: 'c@example.com',
        roles: ['country_manager'],
        countries: [],
      }),
    ]);
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      expect(await access.resolve({ email, sub: null, realm: [] })).toBeNull();
    }
    expect(await access.resolve(null)).toBeNull();
  });
});
