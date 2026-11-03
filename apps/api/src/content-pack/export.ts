import { Prisma, type PrismaClient } from '@prisma/client';
import {
  LandingOverridesSchema,
  REFERENCE_KEYS,
  type Language,
} from '@fabulka/shared';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  FILES_DIR,
  MANIFEST,
  PACK_VERSION,
  PackSchema,
  landingFiles,
  landingImages,
  packClientKey,
  packProblems,
  type Pack,
  type PackBook,
  type PackFile,
  type PackLanding,
} from './pack';

/** The Book columns a pack carries: every scalar one but the keys that are the target's own. */
export const BOOK_COLUMNS = Prisma.dmmf.datamodel.models
  .find((m) => m.name === 'Book')!
  .fields.filter(
    (f) =>
      (f.kind === 'scalar' || f.kind === 'enum') &&
      !['id', 'templateId', 'userId'].includes(f.name),
  )
  .map((f) => ({ name: f.name, json: f.type === 'Json' }));

export interface ExportOptions {
  /** The countries whose samples, examples (shown only in them) and landing go into the pack. */
  countries: string[];
  /** Countries where the site's global examples are hidden on import (Pack.hideGlobalExamplesIn). */
  hideGlobalIn?: string[];
}

/**
 * Writes a pack of `countries` from this database and storage into `out`: their catalog samples, the
 * examples shown only in them (finished versions), their landing hero texts and pictures, every book
 * those use and every file of those books. Refuses a pack that does not hold together.
 */
export async function exportPack(
  prisma: PrismaClient,
  storageRoot: string,
  out: string,
  options: ExportOptions,
): Promise<Pack> {
  const countries = new Set(options.countries);
  const samples = await prisma.templateSample.findMany({
    where: { country: { in: [...countries] }, book: { status: 'done' } },
    include: { template: { select: { slug: true } } },
    orderBy: [{ country: 'asc' }, { createdAt: 'asc' }],
  });
  const examples = (
    await prisma.example.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        versions: {
          where: { book: { status: 'done' } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
  ).filter(
    (e) =>
      e.countriesMode === 'include' &&
      e.countries.length > 0 &&
      e.countries.every((c) => countries.has(c)) &&
      e.versions.length > 0,
  );
  const stored = await prisma.setting.findUnique({
    where: { key: REFERENCE_KEYS.landing },
  });
  const overrides = LandingOverridesSchema.parse(stored?.value ?? {});
  const landing: PackLanding[] = [...countries]
    .filter((code) => overrides[code])
    .map((code) => ({
      country: code,
      hero: overrides[code].hero,
      images: overrides[code].images ?? {},
    }));

  const ids = new Set<string>([
    ...samples.map((s) => s.bookId),
    ...examples.flatMap((e) => e.versions.map((v) => v.bookId)),
    ...landing.flatMap((l) =>
      landingImages(l).flatMap(({ image }) =>
        image.book ? [image.book.id] : [],
      ),
    ),
  ]);
  const rows = await prisma.book.findMany({
    where: { id: { in: [...ids] } },
    include: { template: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const books: PackBook[] = rows.map((row) => ({
    id: row.id,
    template: row.template?.slug ?? null,
    row: bookRow(row as unknown as Record<string, unknown>),
  }));

  const paths = [
    ...(
      await Promise.all(
        rows.map((row) => listFiles(storageRoot, `books/${row.id}`)),
      )
    ).flat(),
    ...landing.flatMap((l) =>
      landingImages(l).flatMap(({ image }) => landingFiles(image)),
    ),
  ];
  const files: PackFile[] = [];
  for (const path of paths) {
    const data = await readFile(join(storageRoot, path));
    const target = join(out, FILES_DIR, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    files.push({ path, bytes: data.length, sha256: sha256(data) });
  }

  const pack = PackSchema.parse({
    version: PACK_VERSION,
    createdAt: new Date().toISOString(),
    books,
    samples: samples.map((s) => ({
      template: s.template.slug,
      language: s.language as Language,
      country: s.country,
      book: s.bookId,
    })),
    examples: examples.map((e) => ({
      id: e.id,
      countries: e.countries,
      mode: e.countriesMode,
      versions: e.versions.map((v) => ({
        language: v.language,
        book: v.bookId,
      })),
    })),
    landing,
    hideGlobalExamplesIn: options.hideGlobalIn ?? [],
    files,
  });
  const problems = packProblems(pack);
  if (problems.length)
    throw new Error(
      `the pack does not hold together:\n- ${problems.join('\n- ')}`,
    );
  await mkdir(out, { recursive: true });
  await writeFile(join(out, MANIFEST), JSON.stringify(pack, null, 2));
  return pack;
}

/** A book row as the pack keeps it: its columns, dates as ISO strings, a content client key. */
export function bookRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name } of BOOK_COLUMNS) {
    const value = row[name];
    out[name] = value instanceof Date ? value.toISOString() : value;
  }
  out.clientKey = packClientKey(String(row.clientKey));
  return out;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Every file under a storage folder, as storage paths, sorted. */
export async function listFiles(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
