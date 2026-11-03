import { NO_ACCESS, type InviteEmailStatus } from '@fabulka/shared';
import type { AdminSession } from '../admin/admin-auth.service';
import type { KeycloakAdminService } from './keycloak-admin.service';
import { StaffAccessService } from './staff-access.service';
import { fakeStaffPrisma, staffRow } from './staff.testing';
import { TeamService } from './team.service';

const by: AdminSession = {
  ...NO_ACCESS,
  roles: ['admin'],
  who: 'owner@example.com',
  staffId: null,
};

function setup(
  rows = [staffRow({ email: 'owner@example.com', roles: ['admin'] })],
  email: InviteEmailStatus = 'sent',
) {
  const { prisma, service } = fakeStaffPrisma(rows);
  const access = new StaffAccessService(service);
  const invalidate = jest.spyOn(access, 'invalidate');
  const keycloak = { invite: jest.fn().mockResolvedValue(email) };
  const team = new TeamService(
    service,
    access,
    keycloak as unknown as KeycloakAdminService,
  );
  return { prisma, team, keycloak, invalidate };
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { getResponse?: () => { code?: string } }) =>
      error.getResponse?.().code,
  );

describe('TeamService invite', () => {
  it('saves an invited row and asks Keycloak to send the set-up email', async () => {
    const { prisma, team, keycloak, invalidate } = setup();
    const result = await team.invite(
      {
        email: 'anna@example.com',
        name: 'Anna',
        roles: ['country_manager'],
        countries: ['DE'],
      },
      by,
    );
    expect(result.email).toBe('sent');
    expect(result.member).toMatchObject({
      email: 'anna@example.com',
      status: 'invited',
      roles: ['country_manager'],
      countries: ['DE'],
      linked: false,
      createdBy: 'owner@example.com',
    });
    expect(keycloak.invite).toHaveBeenCalledWith('anna@example.com', 'Anna');
    expect(prisma.staffMember.rows).toHaveLength(2);
    expect(invalidate).toHaveBeenCalled();
  });

  it('keeps the row when Keycloak is not configured or fails', async () => {
    for (const status of ['not_configured', 'failed'] as const) {
      const { prisma, team } = setup(undefined, status);
      const result = await team.invite(
        { email: 'anna@example.com', name: '', roles: ['seo'], countries: [] },
        by,
      );
      expect(result.email).toBe(status);
      expect(prisma.staffMember.rows.map((r) => r.email)).toContain(
        'anna@example.com',
      );
    }
  });

  it('refuses a country manager without countries, an unknown role and someone already on the team', async () => {
    const { team } = setup();
    expect(
      await code(
        team.invite(
          {
            email: 'a@example.com',
            name: '',
            roles: ['country_manager'],
            countries: [],
          },
          by,
        ),
      ),
    ).toBe('staff_countries_required');
    expect(
      await code(
        team.invite(
          { email: 'a@example.com', name: '', roles: ['ghost'], countries: [] },
          by,
        ),
      ),
    ).toBe('staff_unknown_role');
    expect(
      await code(
        team.invite(
          {
            email: 'owner@example.com',
            name: '',
            roles: ['seo'],
            countries: [],
          },
          by,
        ),
      ),
    ).toBe('staff_exists');
  });

  it('resends the invitation', async () => {
    const { team, keycloak, prisma } = setup();
    const result = await team.resend(prisma.staffMember.rows[0].id);
    expect(result.email).toBe('sent');
    expect(keycloak.invite).toHaveBeenCalledWith('owner@example.com', '');
  });
});

describe('TeamService last-superadmin guard', () => {
  it('refuses to disable or demote the last active superadmin, themself included', async () => {
    const { team, prisma } = setup();
    const id = prisma.staffMember.rows[0].id;
    expect(await code(team.disable(id))).toBe('staff_last_superadmin');
    expect(await code(team.update(id, { roles: ['seo'] }))).toBe(
      'staff_last_superadmin',
    );
    expect(prisma.staffMember.rows[0]).toMatchObject({
      status: 'active',
      roles: ['admin'],
    });
  });

  it('allows it while another active superadmin remains', async () => {
    const { team, prisma } = setup([
      staffRow({ email: 'a@example.com', roles: ['admin'] }),
      staffRow({ email: 'b@example.com', roles: ['admin'] }),
    ]);
    expect((await team.disable(prisma.staffMember.rows[0].id)).status).toBe(
      'disabled',
    );
    // Now b is the last one.
    expect(await code(team.disable(prisma.staffMember.rows[1].id))).toBe(
      'staff_last_superadmin',
    );
  });

  it('does not count a disabled superadmin as the one remaining', async () => {
    const { team, prisma } = setup([
      staffRow({ email: 'a@example.com', roles: ['admin'] }),
      staffRow({
        email: 'b@example.com',
        roles: ['admin'],
        status: 'disabled',
      }),
    ]);
    expect(
      await code(
        team.update(prisma.staffMember.rows[0].id, { roles: ['seo'] }),
      ),
    ).toBe('staff_last_superadmin');
  });

  it('refuses to disable or demote a Keycloak realm admin', async () => {
    const { team, prisma } = setup([
      staffRow({
        email: 'owner@example.com',
        roles: ['admin'],
        realmRoles: ['admin'],
      }),
      staffRow({ email: 'other@example.com', roles: ['admin'] }),
    ]);
    const id = prisma.staffMember.rows[0].id;
    expect(await code(team.disable(id))).toBe('staff_realm_admin');
    expect(await code(team.update(id, { roles: ['seo'] }))).toBe(
      'staff_realm_admin',
    );
    // Editing what does not demote them is fine.
    expect((await team.update(id, { name: 'Owner' })).name).toBe('Owner');
  });

  it('enables again: active once linked, invited before', async () => {
    const { team, prisma } = setup([
      staffRow({ email: 'owner@example.com', roles: ['admin'] }),
      staffRow({
        email: 'a@example.com',
        roles: ['seo'],
        status: 'disabled',
        keycloakId: 'kc-a',
      }),
      staffRow({ email: 'b@example.com', roles: ['seo'], status: 'disabled' }),
    ]);
    expect((await team.enable(prisma.staffMember.rows[1].id)).status).toBe(
      'active',
    );
    expect((await team.enable(prisma.staffMember.rows[2].id)).status).toBe(
      'invited',
    );
  });
});

describe('TeamService roles', () => {
  it('lists the seeded roles with members, superadmin first', async () => {
    const { team } = setup();
    const roles = await team.roles();
    expect(roles.map((r) => [r.key, r.locked, r.builtin, r.members])).toEqual([
      ['admin', true, true, 1],
      ['seo', false, true, 0],
      ['country_manager', false, false, 0],
    ]);
  });

  it('creates, edits and deletes a role', async () => {
    const { team, prisma, invalidate } = setup();
    const role = await team.createRole({
      key: 'orders_only',
      name: 'Orders',
      rights: ['orders'],
      scoped: false,
    });
    expect(role).toMatchObject({
      key: 'orders_only',
      rights: ['orders'],
      members: 0,
      builtin: false,
    });
    expect(invalidate).toHaveBeenCalled();
    expect(
      await code(
        team.createRole({
          key: 'orders_only',
          name: 'X',
          rights: ['orders'],
          scoped: false,
        }),
      ),
    ).toBe('role_exists');
    expect(
      (
        await team.updateRole('orders_only', {
          name: 'Orders desk',
          rights: ['orders', 'books'],
          scoped: false,
        })
      ).rights,
    ).toEqual(['orders', 'books']);
    await team.deleteRole('orders_only');
    expect(prisma.staffRole.rows.map((r) => r.key)).not.toContain(
      'orders_only',
    );
  });

  it('never edits the superadmin role, never deletes a realm-mapped or assigned role', async () => {
    const { team, prisma } = setup([
      staffRow({ email: 'owner@example.com', roles: ['admin'] }),
      staffRow({
        email: 'cm@example.com',
        roles: ['country_manager'],
        countries: ['DE'],
      }),
    ]);
    expect(
      await code(
        team.updateRole('admin', {
          name: 'X',
          rights: ['orders'],
          scoped: false,
        }),
      ),
    ).toBe('role_locked');
    expect(await code(team.deleteRole('admin'))).toBe('role_locked');
    expect(await code(team.deleteRole('seo'))).toBe('role_builtin');
    expect(await code(team.deleteRole('country_manager'))).toBe('role_in_use');
    expect(await code(team.deleteRole('ghost'))).toBe('role_not_found');
    expect(prisma.staffRole.rows).toHaveLength(3);
  });

  it('refuses to make a role country-scoped while a holder has no countries', async () => {
    const { team } = setup([
      staffRow({ email: 'owner@example.com', roles: ['admin'] }),
      staffRow({ email: 's@example.com', roles: ['seo'] }),
    ]);
    expect(
      await code(
        team.updateRole('seo', { name: 'SEO', rights: ['seo'], scoped: true }),
      ),
    ).toBe('staff_countries_required');
  });
});
