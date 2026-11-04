import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  CONSENT_OUTDATED,
  PHOTO_REFUSED,
  type HeroPhotoUpload,
  type Language,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { ConsentService } from '../consent/consent.service';
import { JournalService } from '../journal/journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { cleanPhoto, PhotoRefused } from './photo';

/** Where hero photos wait, under the private (never served) storage root. */
const DIR = 'hero-photos';
/** A photo no book used, or a book stuck before its hero, is deleted this long after upload at the latest. */
export const HERO_PHOTO_TTL_MS = 60 * 60 * 1000;
/** The longest side of the copy kept for the models: enough for a face, small to send. */
export const HERO_PHOTO_MODEL_SIDE = 1024;

/** What a refused photo's 400 says (the site shows its own text by `reason`). */
const PHOTO_MESSAGES = {
  type: 'A photo must be a JPEG, PNG or HEIC file',
  size: 'The photo is too big: at most 7 MB',
  decode: 'The photo could not be read',
} as const;

/**
 * The child's photo for the hero (the photo path): taken only from a signed-in parent with the
 * current consent, re-encoded without any metadata, kept outside the public files and only until the
 * hero sheet exists. Deleting it removes the file and its row, and the journal records when.
 */
@Injectable()
export class HeroPhotosService {
  private readonly logger = new Logger(HeroPhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly consent: ConsentService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Stores the photo with the consent given for it; returns the upload id the book refers to. 409
   * consent_outdated when the text shown is no longer the current one; 400 photo_refused otherwise.
   */
  async upload(
    body: HeroPhotoUpload,
    userId: string,
  ): Promise<{ upload: string }> {
    const { version, language } = body.consent;
    if (!(await this.consent.isCurrent(language, version)))
      throw new ConflictException({
        code: CONSENT_OUTDATED,
        message: 'The consent text has changed: read it again',
      });
    const bytes = Buffer.from(
      body.image.slice(body.image.indexOf(',') + 1),
      'base64',
    );
    const clean = await cleanPhoto(bytes).catch((error: unknown) => {
      if (!(error instanceof PhotoRefused)) throw error;
      throw new BadRequestException({
        code: PHOTO_REFUSED,
        reason: error.reason,
        message: PHOTO_MESSAGES[error.reason],
      });
    });
    // The models get a smaller copy; the cleaned original is never written anywhere.
    const forModel = await sharp(clean.data)
      .resize(HERO_PHOTO_MODEL_SIDE, HERO_PHOTO_MODEL_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const id = randomBytes(16).toString('hex');
    const path = await this.storage.savePrivate(`${DIR}/${id}.jpg`, forModel);
    await this.prisma.heroPhoto.create({
      data: {
        id,
        userId,
        path,
        consentVersion: version,
        consentLanguage: language,
      },
    });
    return { upload: id };
  }

  /**
   * The consent an upload was given with, when it is this parent's, unused and not expired (checked
   * before the book is made); throws 400 otherwise.
   */
  async consentOf(upload: string, userId: string) {
    const row = await this.prisma.heroPhoto.findUnique({
      where: { id: upload },
    });
    if (
      !row ||
      row.userId !== userId ||
      row.bookId ||
      Date.now() - row.createdAt.getTime() > HERO_PHOTO_TTL_MS
    )
      throw new BadRequestException('The photo was not found: upload it again');
    return {
      consent: {
        version: row.consentVersion,
        language: row.consentLanguage as Language,
        acceptedAt: row.consentAt.toISOString(),
      },
      uploadedAt: row.createdAt.toISOString(),
    };
  }

  /** Hands the photo to its book; false when another book took it first. */
  async claim(upload: string, bookId: string): Promise<boolean> {
    const { count } = await this.prisma.heroPhoto.updateMany({
      where: { id: upload, bookId: null },
      data: { bookId },
    });
    return count === 1;
  }

  /** The photo's bytes; null when it is gone (deleted, expired). */
  async read(upload: string): Promise<Buffer | null> {
    const row = await this.prisma.heroPhoto.findUnique({
      where: { id: upload },
    });
    if (!row) return null;
    return this.storage.readPrivate(row.path).catch(() => null);
  }

  /**
   * Deletes the photo: its file and its row (the only copies). Records the deletion in the journal
   * against the book, with the time and why (after the hero sheet, or given up). Never throws: the
   * file and the row are each tried, failures logged; returns when it was done, or null when there
   * was nothing left to delete (it was deleted before).
   */
  async remove(
    upload: string,
    why: string,
    bookId: string | null = null,
  ): Promise<Date | null> {
    const row = await this.prisma.heroPhoto
      .findUnique({ where: { id: upload } })
      .catch(() => null);
    const path = row?.path ?? `${DIR}/${upload}.jpg`;
    if (!row && !(await this.storage.existsPrivate(path))) return null;
    await this.storage
      .removePrivate(path)
      .catch((error: unknown) =>
        this.logger.error(`hero photo ${upload}: file not removed`, error),
      );
    await this.prisma.heroPhoto
      .deleteMany({ where: { id: upload } })
      .catch((error: unknown) =>
        this.logger.error(`hero photo ${upload}: row not removed`, error),
      );
    const at = new Date();
    this.journal.record({
      bookId: bookId ?? row?.bookId ?? null,
      kind: 'photo-delete',
      model: 'fabulka',
      status: 'ok',
      latencyMs: 0,
      costUsd: 0,
      step: 'sheet.hero',
      output: `The child's photo (file and record) was deleted at ${at.toISOString()}: ${why}.`,
      createdAt: at,
    });
    return at;
  }

  /** Whether the file or the row of an upload still exists (the E2E check after generation). */
  async exists(upload: string): Promise<{ file: boolean; row: boolean }> {
    const row = await this.prisma.heroPhoto.findUnique({
      where: { id: upload },
    });
    return {
      row: !!row,
      file: await this.storage.existsPrivate(`${DIR}/${upload}.jpg`),
    };
  }

  /**
   * On start: a photo a book had taken belongs to a generation the restart cut off (the book is
   * marked failed), so it is deleted at once.
   */
  async dropClaimed(): Promise<number> {
    const claimed = await this.prisma.heroPhoto.findMany({
      where: { bookId: { not: null } },
      select: { id: true },
    });
    for (const { id } of claimed)
      await this.remove(id, 'generation stopped by a restart');
    return claimed.length;
  }

  /** Deletes photos older than the TTL (rows and files), whatever happened to their book. */
  async sweep(now = Date.now()): Promise<number> {
    const old = await this.prisma.heroPhoto.findMany({
      where: { createdAt: { lt: new Date(now - HERO_PHOTO_TTL_MS) } },
      select: { id: true },
    });
    for (const { id } of old) await this.remove(id, 'expired, never used');
    const files = await this.storage.removePrivateOlderThan(
      DIR,
      HERO_PHOTO_TTL_MS,
    );
    return old.length + files;
  }
}

/** Runs the sweep every quarter of the TTL, and once on start. */
@Injectable()
export class HeroPhotosCleaner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeroPhotosCleaner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly photos: HeroPhotosService) {}

  onModuleInit() {
    const sweep = () =>
      this.photos
        .sweep()
        .then(
          (count) =>
            count && this.logger.log(`removed ${count} expired hero photos`),
        )
        .catch((error: unknown) =>
          this.logger.error('hero photo cleanup failed', error),
        );
    void this.photos
      .dropClaimed()
      .catch((error: unknown) =>
        this.logger.error('could not drop photos of cut-off books', error),
      )
      .then(sweep);
    this.timer = setInterval(() => void sweep(), HERO_PHOTO_TTL_MS / 4);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
