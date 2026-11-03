import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { IllustratorReference as ReferenceRow } from '@prisma/client';
import {
  BOOK_THEMES,
  REFERENCE_MAX_BYTES,
  REFERENCE_MODEL_PX,
  REFERENCE_PREVIEW_PX,
  REFERENCE_SLOT_LIMITS,
  type CreateReference,
  type IllustratorReference,
  type ReferenceKind,
  type ReferenceSlot,
  type ReferenceTarget,
  type UpdateReference,
  sameSlot,
  selectReferences,
  slotOf,
} from '@fabulka/shared';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { ReferenceImage } from '../meta/model-gateway';
import { MethodologiesService } from '../methodologies/methodologies.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThemesService } from '../themes/themes.service';

/** Decoding bombs: a small file claiming a huge picture is refused before it is decoded. */
const MAX_PIXELS = 40_000_000;

/** A refusal with the code the admin shows in its own words (REFERENCE_ERRORS). */
const refusal = (code: string, message: string) => ({ code, message });

/**
 * The illustrators' reference pictures (admin «References»): stored at two sizes in the storage, one
 * slot at a time within its limit, and handed to generation as the pictures each call gets.
 */
@Injectable()
export class ReferencesService {
  private readonly logger = new Logger(ReferencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly themes: ThemesService,
    private readonly methodologies: MethodologiesService,
  ) {}

  async list(): Promise<IllustratorReference[]> {
    const rows = await this.prisma.illustratorReference.findMany({
      orderBy: [
        { kind: 'asc' },
        { theme: 'asc' },
        { methodology: 'asc' },
        { beat: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return rows.map((row) => this.dto(row));
  }

  async get(id: string): Promise<IllustratorReference> {
    return this.dto(await this.row(id));
  }

  /**
   * Stores a new picture at the end of its slot: checked by its bytes (JPEG, PNG or WebP), turned
   * upright, stripped of metadata and re-encoded as a JPEG preview and a small copy for the model.
   * 400 reference_bad_slot for a theme or beat that does not exist, reference_bad_image for a file
   * that is not a picture; 409 reference_slot_full past the slot's limit.
   */
  async create(
    input: CreateReference,
    who: string | null,
  ): Promise<IllustratorReference> {
    const slot = slotOf(input);
    await this.checkSlot(slot);
    const count = await this.prisma.illustratorReference.count({
      where: slotWhere(slot),
    });
    if (count >= REFERENCE_SLOT_LIMITS[slot.kind]) {
      throw new ConflictException(
        refusal(
          'reference_slot_full',
          `This slot holds at most ${REFERENCE_SLOT_LIMITS[slot.kind]} pictures`,
        ),
      );
    }
    const bytes = decodeDataUrl(input.image);
    const id = randomBytes(10).toString('hex');
    const { preview, model, width, height } = await prepare(bytes);
    const path = await this.storage.save(
      `references/${id}/preview.jpg`,
      preview,
    );
    const modelPath = await this.storage.save(
      `references/${id}/model.jpg`,
      model,
    );
    const last = await this.prisma.illustratorReference.aggregate({
      where: slotWhere(slot),
      _max: { sortOrder: true },
    });
    const row = await this.prisma.illustratorReference.create({
      data: {
        ...slot,
        path,
        modelPath,
        width,
        height,
        bytes: preview.length,
        note: input.note ?? '',
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        createdBy: who,
      },
    });
    return this.dto(row);
  }

  async update(
    id: string,
    patch: UpdateReference,
  ): Promise<IllustratorReference> {
    await this.row(id);
    const row = await this.prisma.illustratorReference.update({
      where: { id },
      data: patch,
    });
    return this.dto(row);
  }

  async remove(id: string): Promise<IllustratorReference> {
    const row = await this.row(id);
    await this.prisma.illustratorReference.delete({ where: { id } });
    await this.storage.removeDir(`references/${folderOf(row.path)}`);
    return this.dto(row);
  }

  /** One slot's pictures in a new order: every id of that slot, once (400 reference_bad_order otherwise). */
  async reorder(ids: string[]): Promise<IllustratorReference[]> {
    const rows = await this.prisma.illustratorReference.findMany({
      where: { id: { in: ids } },
    });
    const slot = rows[0] && slotOf(rowSlot(rows[0]));
    const inSlot = slot
      ? await this.prisma.illustratorReference.count({
          where: slotWhere(slot),
        })
      : 0;
    if (
      !slot ||
      rows.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      inSlot !== ids.length ||
      rows.some((row) => !sameSlot(rowSlot(row), slot))
    ) {
      throw new BadRequestException(
        refusal(
          'reference_bad_order',
          'Order every picture of one slot, once each',
        ),
      );
    }
    await this.prisma.$transaction(
      ids.map((id, sortOrder) =>
        this.prisma.illustratorReference.update({
          where: { id },
          data: { sortOrder },
        }),
      ),
    );
    return (await this.list()).filter((r) => ids.includes(r.id));
  }

  /**
   * What a book's generation sends: for each call, its enabled references in order (selectReferences),
   * loaded once per book. Never throws: a picture that cannot be read is left out (logged), and a
   * book without references draws as before.
   */
  async forBook(book: {
    theme: string;
    methodology: string;
  }): Promise<BookReferences> {
    let rows: ReferenceRow[] = [];
    try {
      rows = await this.prisma.illustratorReference.findMany({
        where: {
          enabled: true,
          OR: [
            { kind: 'style', theme: book.theme },
            { kind: 'composition', methodology: book.methodology },
            { kind: 'character_guide' },
          ],
        },
      });
    } catch (error) {
      this.logger.warn(`references not loaded: ${describe(error)}`);
    }
    const choices = rows.map((row) => ({
      ...rowSlot(row),
      id: row.id,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      modelPath: row.modelPath,
    }));
    const loaded = new Map<string, Promise<Buffer | null>>();
    const load = (ref: (typeof choices)[number]) => {
      if (!loaded.has(ref.id)) {
        loaded.set(
          ref.id,
          this.storage.read(ref.modelPath).catch((error: unknown) => {
            this.logger.warn(
              `reference ${ref.id} not readable: ${describe(error)}`,
            );
            return null;
          }),
        );
      }
      return loaded.get(ref.id)!;
    };
    return {
      count: choices.length,
      for: async (target) => {
        const picked = selectReferences(choices, book, target);
        const images = await Promise.all(
          picked.map(async (ref) => {
            const data = await load(ref);
            return data ? { id: ref.id, kind: ref.kind, data } : null;
          }),
        );
        return images.filter((image): image is ReferenceImage => !!image);
      },
    };
  }

  /** A style picture's theme must exist (curated or proposed); a sketch's method must have that beat. */
  private async checkSlot(slot: ReferenceSlot): Promise<void> {
    const bad = (message: string) =>
      new BadRequestException(refusal('reference_bad_slot', message));
    if (slot.kind === 'style') {
      const known =
        slot.theme! in BOOK_THEMES ||
        (await this.themes.adminList()).some((t) => t.theme.id === slot.theme);
      if (!known) throw bad(`There is no theme ${slot.theme}`);
    }
    if (slot.kind === 'composition') {
      const method = await this.methodologies.find(slot.methodology!);
      const beats = method ? (method.structure as string[]).length : 0;
      if (!method || slot.beat! > beats) {
        throw bad(`The method ${slot.methodology} has no beat ${slot.beat}`);
      }
    }
  }

  private async row(id: string): Promise<ReferenceRow> {
    const row = await this.prisma.illustratorReference.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(
        refusal('reference_not_found', `No reference ${id}`),
      );
    }
    return row;
  }

  private dto(row: ReferenceRow): IllustratorReference {
    return {
      id: row.id,
      kind: row.kind as ReferenceKind,
      theme: row.theme,
      methodology: row.methodology,
      beat: row.beat,
      imageUrl: this.storage.url(row.path)!,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      note: row.note,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** What generation asks of a book's references. */
export interface BookReferences {
  /** Enabled references that could reach this book. */
  count: number;
  /** The pictures for one call, in order. */
  for(target: ReferenceTarget): Promise<ReferenceImage[]>;
}

/** No references: generation draws as it did before references existed. */
export const NO_REFERENCES: BookReferences = {
  count: 0,
  for: () => Promise.resolve([]),
};

/** A reference's slot as stored. */
function rowSlot(row: ReferenceRow): ReferenceSlot {
  return slotOf({
    kind: row.kind as ReferenceKind,
    theme: row.theme,
    methodology: row.methodology,
    beat: row.beat,
  });
}

function slotWhere(slot: ReferenceSlot) {
  return {
    kind: slot.kind,
    theme: slot.theme,
    methodology: slot.methodology,
    beat: slot.beat,
  };
}

/** references/<folder>/preview.jpg → <folder>. */
function folderOf(path: string): string {
  return path.split('/')[1] ?? '';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The bytes of a data URL, size-checked (400 reference_bad_image). */
export function decodeDataUrl(url: string): Buffer {
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  if (comma < 0 || !/^data:image\/[a-z0-9.+-]+;base64$/i.test(header)) {
    throw new BadRequestException(
      refusal('reference_bad_image', 'Send the picture as a data URL'),
    );
  }
  const bytes = Buffer.from(url.slice(comma + 1), 'base64');
  if (!bytes.length || bytes.length > REFERENCE_MAX_BYTES) {
    throw new BadRequestException(
      refusal(
        'reference_bad_image',
        `A picture is at most ${REFERENCE_MAX_BYTES / 1024 / 1024} MB`,
      ),
    );
  }
  return bytes;
}

/** What the bytes are, by their signature (the declared type is never trusted). */
export function referenceType(data: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) return 'jpeg';
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (
    data.length >= 12 &&
    data.toString('latin1', 0, 4) === 'RIFF' &&
    data.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** The preview (≤ REFERENCE_PREVIEW_PX) and the model's copy (≤ REFERENCE_MODEL_PX), both JPEG on white. */
export async function prepare(data: Buffer): Promise<{
  preview: Buffer;
  model: Buffer;
  width: number;
  height: number;
}> {
  const bad = () =>
    new BadRequestException(
      refusal('reference_bad_image', 'A picture must be a JPEG, PNG or WebP'),
    );
  if (!referenceType(data)) throw bad();
  try {
    const source = sharp(data, { limitInputPixels: MAX_PIXELS }).rotate();
    const size = (px: number) =>
      source
        .clone()
        .resize(px, px, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: px > REFERENCE_MODEL_PX ? 86 : 82, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    const [preview, model] = await Promise.all([
      size(REFERENCE_PREVIEW_PX),
      size(REFERENCE_MODEL_PX),
    ]);
    return {
      preview: preview.data,
      model: model.data,
      width: preview.info.width,
      height: preview.info.height,
    };
  } catch {
    throw bad();
  }
}
