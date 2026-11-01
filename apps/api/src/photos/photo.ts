import { PHOTO_MAX_BYTES, type PhotoRefusal } from '@fabulka/shared';
import decodeHeic from 'heic-decode';
import sharp from 'sharp';

/** The longest side of a stored photo: plenty for a full page at 300 dpi on the largest format. */
export const PHOTO_MAX_SIDE = 2400;
/** A stored photo is re-encoded at lower quality until it is at most this big. */
export const PHOTO_MAX_STORED = 1_500_000;
/** Decoding bombs: a small file claiming a huge picture is refused before it is decoded. */
const MAX_PIXELS = 50_000_000;

/** Why a photo was refused; the controller turns it into a 400 photo_refused. */
export class PhotoRefused extends Error {
  constructor(readonly reason: PhotoRefusal) {
    super(`photo refused: ${reason}`);
  }
}

/** What the bytes are, by their signature (the declared type is never trusted). */
export function photoType(data: Buffer): 'jpeg' | 'png' | 'heic' | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'jpeg';
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  // ISO BMFF: a box "ftyp" with a HEIF brand (iPhone photos are "heic", some "mif1"/"heix").
  if (data.length >= 12 && data.toString('latin1', 4, 8) === 'ftyp') {
    const brands = data.toString('latin1', 8, Math.min(data.length, 64));
    if (/heic|heix|hevc|heim|heis|mif1|msf1/.test(brands)) return 'heic';
  }
  return null;
}

/**
 * The parent's photo made safe to store and print: only JPEG, PNG or HEIC (by its bytes), at most
 * PHOTO_MAX_BYTES; turned upright by its EXIF orientation, scaled to PHOTO_MAX_SIDE and re-encoded as
 * a JPEG with no metadata at all — EXIF (location included), XMP, ICC and comments are dropped —
 * at a quality that keeps it under PHOTO_MAX_STORED. It is never sent to any model.
 */
export async function cleanPhoto(
  data: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (data.length > PHOTO_MAX_BYTES) throw new PhotoRefused('size');
  const type = photoType(data);
  if (!type) throw new PhotoRefused('type');
  let input: sharp.Sharp;
  try {
    if (type === 'heic') {
      // libvips here reads only AVIF from HEIF files; HEIC (HEVC) is decoded by libheif in wasm.
      const image = await decodeHeic({ buffer: data });
      if (image.width * image.height > MAX_PIXELS)
        throw new PhotoRefused('size');
      input = sharp(
        Buffer.from(
          image.data.buffer,
          image.data.byteOffset,
          image.data.byteLength,
        ),
        {
          raw: { width: image.width, height: image.height, channels: 4 },
        },
      );
    } else {
      const meta = await sharp(data).metadata();
      if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXELS)
        throw new PhotoRefused('size');
      input = sharp(data, { limitInputPixels: MAX_PIXELS }).rotate();
    }
    // A transparent PNG goes on white, as it would be printed.
    const upright = await input
      .flatten({ background: '#ffffff' })
      .resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = upright.info;
    for (const quality of [86, 78, 70, 62, 54]) {
      // sharp writes no metadata unless asked to (withMetadata / keepExif), so none is kept.
      const jpeg = await sharp(upright.data, {
        raw: { width, height, channels },
      })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (jpeg.length <= PHOTO_MAX_STORED || quality === 54)
        return { data: jpeg, width, height };
    }
    throw new PhotoRefused('size');
  } catch (error) {
    if (error instanceof PhotoRefused) throw error;
    throw new PhotoRefused('decode');
  }
}
