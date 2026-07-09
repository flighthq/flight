// Sniffs the MIME type of encoded image bytes from their magic-number header, or null when the header is
// too short or unrecognized. The single point of image-format identification in the SDK, used by
// decodeImage to auto-select a registered decoder and by @flighthq/image to type a Blob.
export function detectImageMimeType(data: Readonly<Uint8Array> | ArrayBuffer): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';

  // GIF87a / GIF89a: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';

  // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
  if (
    b.byteLength >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';

  // BMP: 42 4D
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';

  return null;
}
