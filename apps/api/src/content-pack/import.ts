import { Prisma, type PrismaClient } from '@prisma/client';
import {
  CountriesSchema,
  DEFAULT_COUNTRIES,
  LandingOverridesSchema,
  REFERENCE_KEYS,
  type CountryRule,
} from '@fabulka/shared';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BOOK_COLUMNS, sha256 } from './export';
import {
  FILES_DIR,
  MANIFEST,
  PackSchema,
  hiddenRule,
  mergeLanding,
  newOrder,
  packProblems,
  targetProblems,
  type PackBook,
} from './pack';

/** Where the pack's files go: the app's storage (StorageService). */
export interface FileStore {
  read(path: string): Promise<Buffer>;
  save(path: string, data: Buffer): Promise<string>;
}

/** What an import did, or would do with --dry-run. */
export interface ImportReport {
  dryRun: boolean;
  books: { created: string[]; updated: string[] };
  files: { written: number; bytes: number; same: number };
  samples: { set: string[]; same: string[] };
  examples: { created: string[]; updated: string[]; versions: string[] };
  hidden: { id: string; from: CountryRule; to: CountryRule }[];
  /** Global examples that cannot be hidden there (an include list would empty). */
  notHidden: string[];
  landing: string[];
}

/**
 * Puts a pack (export.ts) into this database and storage: files first (only those missing or
 * different), then in one transaction the books (by id, catalog books by slug), the samples (by
 * catalog book, language and country), the examples and their versions (by id; new ones go first on
 * the home page), the landing texts and pictures, and the hiding of global examples in the pack's
 * countries. Refuses a pack that does not hold together or does not fit this database, before
 * writing anything. With `dryRun` it only reports.
 */
export async function importPack(
  prisma: PrismaClient,
  storage: FileStore,
  dir: string,
  { dryRun }: { dryRun: boolean },
): Promise<ImportReport> {
  const pack = PackSchema.parse(
    JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')),
  );
  const problems = packProblems(pack);
  const contents = new Map<string, Buffer>();
  for (const file of pack.files) {
    const data = await readFile(join(dir, FILES_DIR, file.path)).catch(
      () => null,
    );
    if (!data) problems.push(`${file.path} is missing from the pack`);
    else if (data.length !== file.bytes || sha256(data) !== file.sha256)
      problems.push(`${file.path} is not the file the manifest lists`);
    else contents.set(file.path, data);
  }
  if (problems.length)
    throw refused('The pack does not hold together', problems);

  const ids = pack.books.map((b) => b.id);
  const [templates, countries, existingBooks, landingRow] = await Promise.all([
    prisma.bookTemplate.findMany({ select: { id: true, slug: true } }),
    prisma.setting.findUnique({ where: { key: REFERENCE_KEYS.countries } }),
    prisma.book.findMany({
      where: { id: { in: ids } },
      select: { id: true, clientKey: true },
    }),
    prisma.setting.findUnique({ where: { key: REFERENCE_KEYS.landing } }),
  ]);
  const offered = CountriesSchema.safeParse(countries?.value);
  const templateId = new Map(templates.map((t) => [t.slug, t.id]));
  const fit = targetProblems(pack, {
    templates: new Set(templateId.keys()),
    offered: new Set(
      (offered.success ? offered.data : DEFAULT_COUNTRIES).map((c) => c.code),
    ),
    books: new Map(existingBooks.map((b) => [b.id, b.clientKey])),
  });
  if (fit.length) throw refused('The pack does not fit this database', fit);

  const report: ImportReport = {
    dryRun,
    books: { created: [], updated: [] },
    files: { written: 0, bytes: 0, same: 0 },
    samples: { set: [], same: [] },
    examples: { created: [], updated: [], versions: [] },
    hidden: [],
    notHidden: [],
    landing: [],
  };
  const known = new Set(existingBooks.map((b) => b.id));
  for (const book of pack.books)
    (known.has(book.id) ? report.books.updated : report.books.created).push(
      book.id,
    );

  const toWrite: string[] = [];
  for (const file of pack.files) {
    const there = await storage.read(file.path).catch(() => null);
    if (there && sha256(there) === file.sha256) report.files.same++;
    else toWrite.push(file.path);
  }
  report.files.written = toWrite.length;
  report.files.bytes = toWrite.reduce((n, p) => n + contents.get(p)!.length, 0);

  const samples = await prisma.templateSample.findMany({
    where: {
      country: { in: [...new Set(pack.samples.map((s) => s.country))] },
    },
    include: { template: { select: { slug: true } } },
  });
  for (const s of pack.samples) {
    const key = `${s.template}/${s.language}/${s.country}`;
    const there = samples.find(
      (r) =>
        r.template.slug === s.template &&
        r.language === s.language &&
        r.country === s.country,
    );
    (there?.bookId === s.book ? report.samples.same : report.samples.set).push(
      key,
    );
  }

  const examples = await prisma.example.findMany({
    include: {
      versions: {
        orderBy: { createdAt: 'asc' },
        include: {
          book: {
            select: {
              template: { select: { countries: true, countriesMode: true } },
            },
          },
        },
      },
    },
  });
  const packIds = new Set(pack.examples.map((e) => e.id));
  for (const e of pack.examples) {
    const there = examples.find((x) => x.id === e.id);
    (there ? report.examples.updated : report.examples.created).push(e.id);
    for (const v of e.versions) {
      if (
        there?.versions.some(
          (x) => x.language === v.language && x.bookId === v.book,
        )
      )
        continue;
      report.examples.versions.push(`${e.id}/${v.language}`);
    }
  }
  const order = newOrder(
    examples.length ? Math.min(...examples.map((e) => e.sortOrder)) : null,
    report.examples.created.length,
  );
  if (pack.hideGlobalExamplesIn.length) {
    for (const e of examples) {
      if (packIds.has(e.id)) continue;
      const own = { mode: e.countriesMode, countries: e.countries };
      const template = e.versions[0]?.book.template;
      const templateRule = template
        ? { mode: template.countriesMode, countries: template.countries }
        : null;
      const to = hiddenRule(own, templateRule, pack.hideGlobalExamplesIn);
      if (to === 'stuck') report.notHidden.push(e.id);
      else if (to !== 'unchanged')
        report.hidden.push({ id: e.id, from: own, to });
    }
  }

  const landing = mergeLanding(
    LandingOverridesSchema.parse(landingRow?.value ?? {}),
    pack.landing,
  );
  report.landing = landing.changed;
  if (dryRun) return report;

  for (const path of toWrite) await storage.save(path, contents.get(path)!);
  await prisma.$transaction(
    async (tx) => {
      for (const book of pack.books) {
        const data = bookData(book, templateId);
        await tx.book.upsert({
          where: { id: book.id },
          create: { id: book.id, ...data },
          update: data,
        });
      }
      for (const s of pack.samples) {
        const template = templateId.get(s.template)!;
        await tx.templateSample.deleteMany({
          where: {
            OR: [
              {
                templateId: template,
                language: s.language,
                country: s.country,
              },
              { bookId: s.book },
            ],
          },
        });
        await tx.templateSample.create({
          data: {
            templateId: template,
            language: s.language,
            country: s.country,
            bookId: s.book,
          },
        });
      }
      let placed = 0;
      for (const e of pack.examples) {
        const data = { countries: e.countries, countriesMode: e.mode };
        if (report.examples.created.includes(e.id))
          await tx.example.create({
            data: { id: e.id, ...data, sortOrder: order[placed++] },
          });
        else await tx.example.update({ where: { id: e.id }, data });
        for (const v of e.versions) {
          await tx.exampleVersion.deleteMany({
            where: {
              OR: [
                { exampleId: e.id, language: v.language },
                { bookId: v.book },
              ],
            },
          });
          await tx.exampleVersion.create({
            data: { exampleId: e.id, language: v.language, bookId: v.book },
          });
        }
      }
      // An example some version left without any (its book moved to a pack example) goes, as in the admin.
      await tx.example.deleteMany({ where: { versions: { none: {} } } });
      for (const h of report.hidden)
        await tx.example.update({
          where: { id: h.id },
          data: { countries: [...h.to.countries], countriesMode: h.to.mode },
        });
      if (report.landing.length)
        await tx.setting.upsert({
          where: { key: REFERENCE_KEYS.landing },
          create: { key: REFERENCE_KEYS.landing, value: landing.next },
          update: { value: landing.next },
        });
    },
    { timeout: 120_000 },
  );
  return report;
}

/** The Book row to write: the pack's columns, its catalog book by slug, no account. */
export function bookData(
  book: PackBook,
  templateId: ReadonlyMap<string, string>,
): Prisma.BookUncheckedCreateInput {
  const data: Record<string, unknown> = {};
  for (const { name, json } of BOOK_COLUMNS) {
    if (!(name in book.row)) continue;
    const value = book.row[name];
    data[name] = json && value === null ? Prisma.DbNull : value;
  }
  data.templateId = book.template ? templateId.get(book.template)! : null;
  data.userId = null;
  return data as unknown as Prisma.BookUncheckedCreateInput;
}

function refused(what: string, problems: string[]): Error {
  return new Error(`${what}:\n- ${problems.join('\n- ')}`);
}

/** The report in a few lines. */
export function describeImport(r: ImportReport): string {
  const list = (items: string[]) =>
    items.length ? ` (${items.join(', ')})` : '';
  return [
    r.dryRun ? 'DRY RUN: nothing was written' : 'imported',
    `books: ${r.books.created.length} new, ${r.books.updated.length} updated`,
    `files: ${r.files.written} to write (${(r.files.bytes / 1024 / 1024).toFixed(1)} MB), ${r.files.same} already there`,
    `samples: ${r.samples.set.length} set${list(r.samples.set)}, ${r.samples.same.length} unchanged`,
    `examples: ${r.examples.created.length} new, ${r.examples.updated.length} updated, ${r.examples.versions.length} versions set`,
    `global examples hidden: ${r.hidden.map((h) => `${h.id} → ${h.to.mode} ${h.to.countries.join(',')}`).join('; ') || 'none'}`,
    ...(r.notHidden.length
      ? [`could not hide: ${r.notHidden.join(', ')}`]
      : []),
    `landing: ${r.landing.join(', ') || 'unchanged'}`,
  ].join('\n');
}
