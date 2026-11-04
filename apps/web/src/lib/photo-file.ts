import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoRefusal } from "@fabulka/shared";

/**
 * A photo the parent picks (the photo page, the hero's photo): checked and made small in the browser
 * before it is sent. The API checks the bytes again, converts HEIC and re-encodes it without metadata.
 */

/** The file input's accept list: JPEG, PNG and HEIC (by extension too, as iPhones name them). */
export const PHOTO_ACCEPT = [...PHOTO_TYPES, ".heic", ".heif"].join(",");

/** What the site accepts before sending: the API checks the bytes again and re-encodes the photo. */
export function photoProblem(file: File): PhotoRefusal | null {
  const heic = /\.(heic|heif)$/i.test(file.name);
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type) && !heic) return "type";
  if (file.size > PHOTO_MAX_BYTES) return "size";
  return null;
}

/** Above this a JPEG or PNG is made smaller in the browser first, so the upload stays small. */
const SHRINK_ABOVE = 3 * 1024 * 1024;
const SHRINK_SIDE = 2400;

/**
 * A big JPEG or PNG redrawn at most SHRINK_SIDE px on its longest side as a JPEG: a phone photo of
 * 10 MB becomes 1-2 MB, which fits the upload limit (the API re-encodes it again anyway). HEIC and
 * small files go as they are; if the browser can't draw the file, the original goes and the API decides.
 */
export async function shrinkPhoto(file: File, above = SHRINK_ABOVE, side = SHRINK_SIDE): Promise<File> {
  if (file.size <= above || !["image/jpeg", "image/png"].includes(file.type)) return file;
  return (await redraw(file, side, 0.9)) ?? file;
}

/**
 * The photo redrawn at most `side` px on its longest side (never larger) as a JPEG, upright as the
 * phone took it; null if the browser can't draw it (a HEIC in a browser that can't read HEIC).
 */
async function redraw(file: File, side: number, quality: number): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

/** The longest side of the child's photo as sent: enough for the hero, quick to send from a phone. */
const HERO_SIDE = 1600;

/**
 * The child's photo made small before it is sent: at most HERO_SIDE px on its longest side, JPEG at
 * 0.85, so a phone photo of several MB goes as a few hundred KB. Any photo the browser can draw is
 * redrawn (a HEIC too, where the browser reads it); if it can't, the original goes as it is and the
 * API decides. A JPEG that is already smaller than its redrawn copy also goes as it is.
 */
export async function shrinkHeroPhoto(file: File): Promise<File> {
  const small = await redraw(file, HERO_SIDE, 0.85);
  if (!small) return file;
  return file.type === "image/jpeg" && file.size <= small.size ? file : small;
}

/** The file as a data URL, as the API takes photos. */
export const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
