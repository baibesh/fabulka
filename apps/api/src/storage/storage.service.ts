import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  copyFile,
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

  /** Copies a stored file to another path (its folder is made); returns the new path. */
  async copy(fromPath: string, toPath: string): Promise<string> {
    const to = join(this.root, toPath);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(this.root, fromPath), to);
    return toPath;
  }

  remove(relativePath: string): Promise<void> {
    return rm(join(this.root, relativePath), { force: true });
  }

  /** Deletes a folder and everything in it (a book's files). */
  removeDir(relativePath: string): Promise<void> {
    return rm(join(this.root, relativePath), { recursive: true, force: true });
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
