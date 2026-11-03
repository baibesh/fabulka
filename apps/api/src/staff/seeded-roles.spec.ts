import {
  ADMIN_PERMISSIONS,
  ADMIN_RIGHTS,
  BUILTIN_ROLES,
} from '@fabulka/shared';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '../../prisma/migrations');

/** Every migration's SQL, in the order Prisma applies them (lexicographic by folder name). */
function migrations(): string {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) =>
      readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

/** The rights an INSERT INTO "StaffRole" gives a role, from the migrations. */
function seededRights(sql: string, key: string): string[] | null {
  const row = new RegExp(`\\('${key}', '[^']*', ARRAY\\[([^\\]]*)\\]`).exec(
    sql,
  );
  return row ? [...row[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : null;
}

describe('seeded roles', () => {
  const sql = migrations();

  it('seed the illustrator with the rights the code gives it', () => {
    const role = BUILTIN_ROLES.find((r) => r.key === 'illustrator')!;
    expect(seededRights(sql, 'illustrator')).toEqual([...role.rights]);
    for (const right of role.rights) expect(ADMIN_RIGHTS).toContain(right);
    // Seeding never overwrites a role the owner already has or edited.
    expect(sql).toMatch(/'illustrator'[\s\S]*ON CONFLICT \("key"\) DO NOTHING/);
  });

  it('give the superadmin row the new section too', () => {
    expect(ADMIN_PERMISSIONS).toContain('references');
    expect(sql).toMatch(
      /SET "rights" = "rights" \|\| ARRAY\['references'\][\s\S]*WHERE "key" = 'admin'/,
    );
  });
});
