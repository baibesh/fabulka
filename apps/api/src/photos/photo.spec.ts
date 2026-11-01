import { PHOTO_MAX_BYTES } from '@fabulka/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PHOTO_MAX_SIDE, PhotoRefused, cleanPhoto, photoType } from './photo';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name));

/** Whether the JPEG still carries any metadata segment: APP1 (EXIF/XMP), APP2 (ICC), APP13, COM. */
function metadataSegments(jpeg: Buffer): string[] {
  const found: string[] = [];
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const marker = jpeg[i + 1];
    if (marker === 0xda) break; // start of scan: the picture itself follows
    const length = jpeg.readUInt16BE(i + 2);
    if ([0xe1, 0xe2, 0xed, 0xfe].includes(marker))
      found.push(marker.toString(16));
    i += 2 + length;
  }
  return found;
}

describe('cleanPhoto', () => {
  it('turns the photo upright and drops every bit of metadata, location included', async () => {
    const input = fixture('child-gps.jpg');
    const before = await sharp(input).metadata();
    // The fixture: 640×480 pixels, orientation 6 (shot rotated), EXIF with a GPS position.
    expect(before.orientation).toBe(6);
    expect(before.exif?.toString('latin1')).toContain('TestCam');
    // The GPS IFD pointer, tag 0x8825, in either byte order.
    const gps = [Buffer.from([0x88, 0x25]), Buffer.from([0x25, 0x88])];
    expect(gps.some((tag) => before.exif?.includes(tag))).toBe(true);

    const photo = await cleanPhoto(input);
    const after = await sharp(photo.data).metadata();
    expect(after.format).toBe('jpeg');
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(metadataSegments(photo.data)).toEqual([]);
    expect(photo.data.toString('latin1')).not.toContain('TestCam');
    // Rotated by its orientation: portrait now.
    expect([photo.width, photo.height]).toEqual([480, 640]);
    expect([after.width, after.height]).toEqual([480, 640]);
  });

  it('converts PNG and HEIC (iPhone) photos to JPEG', async () => {
    for (const name of ['child.png', 'child.heic']) {
      const photo = await cleanPhoto(fixture(name));
      const meta = await sharp(photo.data).metadata();
      expect(meta.format).toBe('jpeg');
      expect([meta.width, meta.height]).toEqual([640, 480]);
      expect(metadataSegments(photo.data)).toEqual([]);
    }
  });

  it('scales a big photo down to the longest side allowed', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#88aacc' },
    })
      .jpeg()
      .toBuffer();
    const photo = await cleanPhoto(big);
    expect([photo.width, photo.height]).toEqual([PHOTO_MAX_SIDE, 1800]);
  });

  it('refuses what is not a JPEG, PNG or HEIC by its bytes, whatever it claims', async () => {
    const gif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      'base64',
    );
    expect(photoType(gif)).toBeNull();
    await expect(cleanPhoto(gif)).rejects.toEqual(new PhotoRefused('type'));
    await expect(
      cleanPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toMatchObject({ reason: 'type' });
    expect(photoType(fixture('child.heic'))).toBe('heic');
  });

  it('refuses a file over the size limit and a broken one', async () => {
    const huge = Buffer.alloc(PHOTO_MAX_BYTES + 1);
    huge.set([0xff, 0xd8, 0xff]);
    await expect(cleanPhoto(huge)).rejects.toMatchObject({ reason: 'size' });
    const broken = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64),
    ]);
    await expect(cleanPhoto(broken)).rejects.toMatchObject({
      reason: 'decode',
    });
  });
});
