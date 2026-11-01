import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Generated files on local disk, served at /files. Swap for R2 when deploying. */
@Injectable()
export class StorageService {
  readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get('STORAGE_DIR', './storage'));
  }

  /** Saves a file and returns its path relative to the storage root. */
  async save(relativePath: string, data: Buffer): Promise<string> {
    const full = join(this.root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return relativePath;
  }

  read(relativePath: string): Promise<Buffer> {
    return readFile(join(this.root, relativePath));
  }

  /** Whether a file is there. */
  exists(relativePath: string): Promise<boolean> {
    return stat(join(this.root, relativePath)).then(
      (s) => s.isFile(),
      () => false,
    );
  }

  remove(relativePath: string): Promise<void> {
    return rm(join(this.root, relativePath), { force: true });
  }

  /** Deletes files in a folder that were last written more than `ageMs` ago; returns how many. */
  async removeOlderThan(relativeDir: string, ageMs: number): Promise<number> {
    const dir = join(this.root, relativeDir);
    const names = await readdir(dir).catch(() => [] as string[]);
    let removed = 0;
    for (const name of names) {
      const file = join(dir, name);
      const { mtimeMs } = await stat(file);
      if (Date.now() - mtimeMs > ageMs) {
        await rm(file, { force: true });
        removed++;
      }
    }
    return removed;
  }

  url(relativePath: string | null): string | null {
    return relativePath ? `/files/${relativePath}` : null;
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
