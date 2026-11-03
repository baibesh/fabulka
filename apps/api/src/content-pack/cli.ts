/**
 * Content packs from the command line (pack.ts says what a pack is), with the app's own Prisma
 * client, DATABASE_URL and STORAGE_DIR:
 *
 *   node dist/content-pack/cli.js export --out <dir> --countries US,DE [--hide-global-in US,DE]
 *   node dist/content-pack/cli.js import <dir> [--dry-run]
 *
 * In the API container: docker compose exec -T api node dist/content-pack/cli.js import /tmp/pack --dry-run
 */
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { EXAMPLES_TAG, SeoWebService } from '../seo/seo-web.service';
import { StorageService } from '../storage/storage.service';
import { exportPack } from './export';
import { describeImport, importPack } from './import';

/** The value after `--name`, or undefined. */
export function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/** A comma-separated list of country codes, upper-cased. */
export function codes(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

async function main(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const config = new ConfigService();
  const prisma = new PrismaClient();
  try {
    const storage = new StorageService(config);
    if (command === 'export') {
      const out = option(rest, 'out');
      const countries = codes(option(rest, 'countries'));
      if (!out || !countries.length)
        throw new Error(
          'export --out <dir> --countries US,DE [--hide-global-in US,DE]',
        );
      const pack = await exportPack(prisma, storage.root, out, {
        countries,
        hideGlobalIn: codes(option(rest, 'hide-global-in')),
      });
      const bytes = pack.files.reduce((n, f) => n + f.bytes, 0);
      console.log(
        `pack written to ${out}: ${pack.books.length} books, ${pack.samples.length} samples, ` +
          `${pack.examples.length} examples, landing of ${pack.landing.map((l) => l.country).join(', ') || 'none'}, ` +
          `${pack.files.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
      );
    } else if (command === 'import') {
      const dir = rest.find((a) => !a.startsWith('--'));
      if (!dir) throw new Error('import <dir> [--dry-run]');
      const dryRun = rest.includes('--dry-run');
      const report = await importPack(prisma, storage, dir, { dryRun });
      console.log(describeImport(report));
      // The site's cached example pages pick the new ones up at once (when it can be told).
      if (!dryRun) await new SeoWebService(config).revalidate([EXAMPLES_TAG]);
    } else {
      throw new Error('usage: export … | import <dir> [--dry-run]');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
