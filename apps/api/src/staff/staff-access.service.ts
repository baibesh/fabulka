import { Injectable, Logger } from '@nestjs/common';
import {
  ADMIN_RIGHTS,
  SUPER_ROLE,
  accessOf,
  realmRolesOf,
  type AdminRight,
  type RoleDef,
} from '@fabulka/shared';
import type { Prisma, StaffMember } from '@prisma/client';
import type { AdminIdentity, AdminSession } from '../admin/admin-auth.service';
import { PrismaService } from '../prisma/prisma.service';

/** How long a resolved session or the roles table is reused before the database is asked again. */
export const ACCESS_CACHE_MS = 5_000;
const MAX_CACHED = 5_000;

/** Who Keycloak (or the test provider) says signed in. */
export interface SignInIdentity {
  sub: string;
  email: string | null;
  /** Keycloak checked the email (the test provider's always is). */
  emailVerified: boolean;
  name: string | null;
  /** Their Keycloak realm roles (all of them; the admin ones are picked here). */
  realmRoles: readonly string[];
}

/**
 * Who may open the admin and what they may do, read from the database (StaffMember, StaffRole) on
 * each admin request with a cache of a few seconds, so disabling someone or changing their roles in
 * Team holds at once (writes through TeamService clear the cache straight away).
 *
 * Keycloak realm roles still work, so nobody is locked out: `admin` is a superadmin even with no
 * staff row (the owner); on sign-in, holders of `admin` or `seo` get a staff row with that role, or
 * have it added to theirs. The emergency password sign-in is a superadmin.
 */
@Injectable()
export class StaffAccessService {
  private readonly logger = new Logger(StaffAccessService.name);
  private roles?: { at: number; defs: RoleDef[] };
  private readonly sessions = new Map<
    string,
    { at: number; session: AdminSession | null }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Forget cached rights: the next request reads the database. */
  invalidate(): void {
    this.roles = undefined;
    this.sessions.clear();
  }

  /** The roles table, cached for a few seconds. */
  async roleDefs(now = Date.now()): Promise<RoleDef[]> {
    if (this.roles && now - this.roles.at < ACCESS_CACHE_MS) {
      return this.roles.defs;
    }
    const rows = await this.prisma.staffRole.findMany();
    const defs = rows.map((row) => ({
      key: row.key,
      scoped: row.scoped,
      rights: row.rights.filter((r): r is AdminRight =>
        (ADMIN_RIGHTS as readonly string[]).includes(r),
      ),
    }));
    this.roles = { at: now, defs };
    return defs;
  }

  /** What the person in an admin cookie may do now, or null when they are not (or no longer) staff. */
  async resolve(
    identity: AdminIdentity | null,
    now = Date.now(),
  ): Promise<AdminSession | null> {
    if (!identity) return null;
    const key = JSON.stringify([
      identity.email,
      identity.sub,
      identity.realm,
      identity.emergency ?? false,
    ]);
    const cached = this.sessions.get(key);
    if (cached && now - cached.at < ACCESS_CACHE_MS) return cached.session;
    const session = await this.read(identity, now);
    if (this.sessions.size >= MAX_CACHED) this.sessions.clear();
    this.sessions.set(key, { at: now, session });
    return session;
  }

  private async read(
    identity: AdminIdentity,
    now: number,
  ): Promise<AdminSession | null> {
    const row = await this.findRow(identity.sub, identity.email);
    const defs = await this.roleDefs(now);
    const who = identity.email ?? row?.email ?? null;
    const staffId = row?.id ?? null;
    // The owner's ways in: the emergency password and the realm role admin, with or without a row.
    if (identity.emergency || identity.realm.includes(SUPER_ROLE)) {
      const access = accessOf(
        [SUPER_ROLE, ...(row?.roles ?? [])],
        defs,
        row?.countries ?? [],
      );
      return { ...access, who, staffId };
    }
    let roles: string[];
    let countries: string[] = [];
    if (row) {
      if (row.status !== 'active') return null;
      roles = row.roles;
      countries = row.countries;
    } else {
      // A realm role holder whose row is missing still gets that role's sections.
      roles = identity.realm;
    }
    const access = accessOf(roles, defs, countries);
    return access.roles.length ? { ...access, who, staffId } : null;
  }

  /**
   * After Keycloak: finds the person's staff row by Keycloak id, else by email (linking the id on
   * their first sign-in, only for a verified email or a realm role holder), makes or refreshes the
   * row of a realm role holder, and answers the identity for the admin cookie, or null when they
   * may not open the admin (no active row, no realm role).
   */
  async signIn(person: SignInIdentity): Promise<AdminIdentity | null> {
    const email = person.email?.trim().toLowerCase() || null;
    const realm = realmRolesOf(person.realmRoles);
    const now = new Date();
    let row = await this.prisma.staffMember.findUnique({
      where: { keycloakId: person.sub },
    });
    if (!row && email) {
      const byEmail = await this.prisma.staffMember.findUnique({
        where: { email },
      });
      if (byEmail?.keycloakId && byEmail.keycloakId !== person.sub) {
        this.logger.warn(
          'staff sign-in: the email belongs to another Keycloak user, not linked',
        );
      } else if (byEmail && (person.emailVerified || realm.length)) {
        row = byEmail;
      } else if (byEmail) {
        this.logger.warn('staff sign-in: unverified email, not linked');
      }
    }
    try {
      if (row) {
        row = await this.prisma.staffMember.update({
          where: { id: row.id },
          data: refreshed(row, person, realm, now),
        });
      } else if (realm.length && email) {
        row = await this.prisma.staffMember.upsert({
          where: { email },
          create: {
            email,
            keycloakId: person.sub,
            name: person.name ?? '',
            status: 'active',
            roles: realm,
            realmRoles: realm,
            lastLoginAt: now,
            createdBy: 'keycloak',
          },
          // Taken by another Keycloak user meanwhile: leave it, the realm role still lets them in.
          update: {},
        });
      }
    } catch (error) {
      // A realm role holder still gets in (resolve() reads the realm roles); log and go on.
      this.logger.error(
        `staff row not saved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.invalidate();
    const identity: AdminIdentity = {
      email: email ?? row?.email ?? null,
      sub: person.sub,
      realm,
    };
    return (await this.resolve(identity)) ? identity : null;
  }

  private async findRow(
    sub: string | null,
    email: string | null,
  ): Promise<StaffMember | null> {
    if (sub) {
      const row = await this.prisma.staffMember.findUnique({
        where: { keycloakId: sub },
      });
      if (row) return row;
    }
    if (!email) return null;
    const row = await this.prisma.staffMember.findUnique({ where: { email } });
    // A row linked to someone else is not this person's.
    return row && (!row.keycloakId || !sub || row.keycloakId === sub)
      ? row
      : null;
  }
}

/**
 * A staff row after a sign-in: linked, seen now, realm roles recorded, an invitation accepted. A
 * realm role adds the role of the same name; one lost since the last sign-in takes it away again.
 * A realm admin is never left disabled (they are a superadmin regardless).
 */
export function refreshed(
  row: StaffMember,
  person: SignInIdentity,
  realm: readonly string[],
  now: Date,
): Prisma.StaffMemberUpdateInput {
  const lost = row.realmRoles.filter((r) => !realm.includes(r));
  const roles = [
    ...row.roles.filter((r) => !lost.includes(r)),
    ...realm.filter((r) => !row.roles.includes(r)),
  ];
  const status: StaffMember['status'] =
    row.status === 'invited' ||
    (row.status === 'disabled' && realm.includes(SUPER_ROLE))
      ? 'active'
      : row.status;
  return {
    keycloakId: row.keycloakId ?? person.sub,
    lastLoginAt: now,
    realmRoles: [...realm],
    roles,
    status,
    ...(person.name && !row.name ? { name: person.name } : {}),
  };
}
