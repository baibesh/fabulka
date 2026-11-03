import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADMIN_RIGHTS,
  SUPER_ROLE,
  UNDELETABLE_ROLES,
  type AdminRight,
  type CreateStaffRoleSchema,
  type InviteResult,
  type InviteStaffSchema,
  type StaffMember as StaffMemberDto,
  type StaffRole as StaffRoleDto,
  type TeamError,
  type UpdateStaffRoleSchema,
  type UpdateStaffSchema,
} from '@fabulka/shared';
import type { StaffMember, StaffRole } from '@prisma/client';
import type { z } from 'zod';
import type { AdminSession } from '../admin/admin-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { StaffAccessService } from './staff-access.service';

type Invite = z.output<typeof InviteStaffSchema>;
type UpdateStaff = z.output<typeof UpdateStaffSchema>;
type CreateRole = z.output<typeof CreateStaffRoleSchema>;
type UpdateRole = z.output<typeof UpdateStaffRoleSchema>;

/** A Team refusal: its code (TEAM_ERRORS) for the admin to put in words, and an English message. */
function refuse(
  Kind: new (body: object) => HttpException,
  code: TeamError,
  message: string,
): never {
  throw new Kind({ code, message });
}

export function staffDto(row: StaffMember): StaffMemberDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: row.roles,
    countries: row.countries,
    status: row.status,
    linked: Boolean(row.keycloakId),
    realmRoles: row.realmRoles,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

/**
 * The admin's Team (superadmin only): staff with their roles, countries and status, invitations
 * through Keycloak, and the roles themselves. Every write clears StaffAccessService's cache, so it
 * holds on the next request. Refusals carry a code (TEAM_ERRORS in @fabulka/shared).
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StaffAccessService,
    private readonly keycloak: KeycloakAdminService,
  ) {}

  async list(): Promise<StaffMemberDto[]> {
    const rows = await this.prisma.staffMember.findMany({
      orderBy: [{ status: 'asc' }, { email: 'asc' }],
    });
    return rows.map(staffDto);
  }

  /** Adds someone and has Keycloak send them the set-up email (the row is kept if it fails). */
  async invite(body: Invite, by: AdminSession): Promise<InviteResult> {
    await this.checkRoles(body.roles, body.countries);
    const existing = await this.prisma.staffMember.findUnique({
      where: { email: body.email },
    });
    if (existing) {
      refuse(ConflictException, 'staff_exists', 'Already on the team');
    }
    const row = await this.prisma.staffMember.create({
      data: {
        email: body.email,
        name: body.name,
        roles: body.roles,
        countries: body.countries,
        status: 'invited',
        createdBy: by.who,
      },
    });
    this.access.invalidate();
    const email = await this.keycloak.invite(row.email, row.name);
    return { member: staffDto(row), email };
  }

  async resend(id: string): Promise<InviteResult> {
    const row = await this.find(id);
    const email = await this.keycloak.invite(row.email, row.name);
    return { member: staffDto(row), email };
  }

  async update(id: string, body: UpdateStaff): Promise<StaffMemberDto> {
    const row = await this.find(id);
    const roles = body.roles ?? row.roles;
    const countries = body.countries ?? row.countries;
    if (body.roles || body.countries) await this.checkRoles(roles, countries);
    if (!roles.includes(SUPER_ROLE)) await this.checkStaysSuper(row);
    const saved = await this.prisma.staffMember.update({
      where: { id },
      data: { name: body.name ?? row.name, roles, countries },
    });
    this.access.invalidate();
    return staffDto(saved);
  }

  /** Takes away their admin (only here: their Keycloak user stays, they may be a customer too). */
  async disable(id: string): Promise<StaffMemberDto> {
    const row = await this.find(id);
    await this.checkStaysSuper(row);
    const saved = await this.prisma.staffMember.update({
      where: { id },
      data: { status: 'disabled' },
    });
    this.access.invalidate();
    return staffDto(saved);
  }

  async enable(id: string): Promise<StaffMemberDto> {
    const row = await this.find(id);
    const saved = await this.prisma.staffMember.update({
      where: { id },
      data: { status: row.keycloakId ? 'active' : 'invited' },
    });
    this.access.invalidate();
    return staffDto(saved);
  }

  // ---- Roles ----------------------------------------------------------------------------------

  async roles(): Promise<StaffRoleDto[]> {
    const [roles, staff] = await Promise.all([
      this.prisma.staffRole.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.staffMember.findMany({ select: { roles: true } }),
    ]);
    return roles
      .map((role) => roleDto(role, staff))
      .sort((a, b) => order(a) - order(b));
  }

  async createRole(body: CreateRole): Promise<StaffRoleDto> {
    const exists = await this.prisma.staffRole.findUnique({
      where: { key: body.key },
    });
    if (exists || body.key === SUPER_ROLE) {
      refuse(ConflictException, 'role_exists', 'A role with this key exists');
    }
    const role = await this.prisma.staffRole.create({
      data: {
        key: body.key,
        name: body.name,
        rights: body.rights,
        scoped: body.scoped,
      },
    });
    this.access.invalidate();
    return roleDto(role, []);
  }

  async updateRole(key: string, body: UpdateRole): Promise<StaffRoleDto> {
    const role = await this.findRole(key);
    if (role.locked) {
      refuse(BadRequestException, 'role_locked', 'This role is not edited');
    }
    const staff = await this.prisma.staffMember.findMany({
      where: { roles: { has: key } },
      select: { roles: true, countries: true, email: true },
    });
    // Making a role country-scoped would leave its holders without countries with nothing.
    if (body.scoped && staff.some((s) => !s.countries.length)) {
      refuse(
        BadRequestException,
        'staff_countries_required',
        'Someone with this role has no countries',
      );
    }
    const saved = await this.prisma.staffRole.update({
      where: { key },
      data: { name: body.name, rights: body.rights, scoped: body.scoped },
    });
    this.access.invalidate();
    return roleDto(saved, staff);
  }

  async deleteRole(key: string): Promise<void> {
    const role = await this.findRole(key);
    if (role.locked) {
      refuse(BadRequestException, 'role_locked', 'This role is not deleted');
    }
    if (UNDELETABLE_ROLES.includes(key)) {
      refuse(
        BadRequestException,
        'role_builtin',
        'A Keycloak realm role maps to this role',
      );
    }
    const members = await this.prisma.staffMember.count({
      where: { roles: { has: key } },
    });
    if (members) {
      refuse(ConflictException, 'role_in_use', 'Someone holds this role');
    }
    await this.prisma.staffRole.delete({ where: { key } });
    this.access.invalidate();
  }

  // ---- Checks ---------------------------------------------------------------------------------

  private async find(id: string): Promise<StaffMember> {
    const row = await this.prisma.staffMember.findUnique({ where: { id } });
    if (!row) refuse(NotFoundException, 'staff_not_found', 'No such person');
    return row;
  }

  private async findRole(key: string): Promise<StaffRole> {
    const role = await this.prisma.staffRole.findUnique({ where: { key } });
    if (!role) refuse(NotFoundException, 'role_not_found', 'No such role');
    return role;
  }

  /** The roles exist, and a country-scoped one comes with at least one country. */
  private async checkRoles(roles: string[], countries: string[]) {
    const found = await this.prisma.staffRole.findMany({
      where: { key: { in: roles } },
    });
    if (found.length !== new Set(roles).size) {
      refuse(BadRequestException, 'staff_unknown_role', 'Unknown role');
    }
    if (found.some((role) => role.scoped) && !countries.length) {
      refuse(
        BadRequestException,
        'staff_countries_required',
        'A country-scoped role needs at least one country',
      );
    }
  }

  /**
   * Before `row` stops being an active superadmin (disabled or demoted): a Keycloak realm admin
   * stays one whatever the row says, so that is refused rather than silently ignored; and someone
   * must remain — the last active superadmin cannot be disabled or demoted, not even by themself.
   */
  private async checkStaysSuper(row: StaffMember) {
    if (row.realmRoles.includes(SUPER_ROLE)) {
      refuse(
        BadRequestException,
        'staff_realm_admin',
        'Holds the Keycloak realm role admin; remove it there first',
      );
    }
    if (row.status !== 'active' || !row.roles.includes(SUPER_ROLE)) return;
    const others = await this.prisma.staffMember.count({
      where: {
        id: { not: row.id },
        status: 'active',
        roles: { has: SUPER_ROLE },
      },
    });
    if (!others) {
      refuse(
        ConflictException,
        'staff_last_superadmin',
        'The last active superadmin stays',
      );
    }
  }
}

function roleDto(
  role: StaffRole,
  staff: readonly { roles: string[] }[],
): StaffRoleDto {
  return {
    key: role.key,
    name: role.name,
    rights: role.rights.filter((r): r is AdminRight =>
      (ADMIN_RIGHTS as readonly string[]).includes(r),
    ),
    scoped: role.scoped,
    locked: role.locked,
    builtin: role.locked || UNDELETABLE_ROLES.includes(role.key),
    members: staff.filter((s) => s.roles.includes(role.key)).length,
  };
}

/** Superadmin first, then the other built-in roles, then the rest as created. */
function order(role: StaffRoleDto): number {
  return role.locked ? 0 : role.builtin ? 1 : 2;
}
