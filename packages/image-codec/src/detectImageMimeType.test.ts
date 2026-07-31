import { detectImageMimeType } from './detectImageMimeType';

describe('detectImageMimeType', () => {
  it('returns null for a buffer that is too small', () => {
    expect(detectImageMimeType(new ArrayBuffer(2))).toBeNull();
  });

  it('returns null for an unrecognised header', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x00, 0x01, 0x02, 0x03]);
    expect(detectImageMimeType(buf)).toBeNull();
  });

  it('detects PNG', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMimeType(buf)).toBe('image/png');
  });

  it('detects JPEG', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageMimeType(buf)).toBe('image/jpeg');
  });

  it('detects GIF', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMimeType(buf)).toBe('image/gif');
  });

  it('detects WebP', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // size (ignored)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(detectImageMimeType(buf)).toBe('image/webp');
  });

  it('detects AVIF from its major brand', () => {
    expect(detectImageMimeType(createFileTypeBox('avif'))).toBe('image/avif');
  });

  it('detects AVIF sequences from a compatible brand', () => {
    expect(detectImageMimeType(createFileTypeBox('mif1', 'avis'))).toBe('image/avif');
  });

  it('rejects a non-AVIF or truncated file type box', () => {
    const brandOutsideBox = new Uint8Array(20);
    brandOutsideBox.set(createFileTypeBox('isom'));
    writeAscii(brandOutsideBox, 16, 'avif');
    expect(detectImageMimeType(createFileTypeBox('isom', 'mp42'))).toBeNull();
    expect(detectImageMimeType(createFileTypeBox('avif').subarray(0, 12))).toBeNull();
    expect(detectImageMimeType(brandOutsideBox)).toBeNull();
  });

  it('detects ICO', () => {
    expect(detectImageMimeType(new Uint8Array([0x00, 0x00, 0x01, 0x00]))).toBe('image/x-icon');
  });

  it('detects little-endian and big-endian TIFF', () => {
    expect(detectImageMimeType(new Uint8Array([0x49, 0x49, 0x2a, 0x00]))).toBe('image/tiff');
    expect(detectImageMimeType(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]))).toBe('image/tiff');
  });

  it('detects BMP', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x42, 0x4d]);
    expect(detectImageMimeType(buf)).toBe('image/bmp');
  });

  it('accepts a Uint8Array directly', () => {
    expect(detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
  });
});

function createFileTypeBox(majorBrand: string, ...compatibleBrands: string[]): Uint8Array {
  const bytes = new Uint8Array(16 + compatibleBrands.length * 4);
  const size = bytes.byteLength;
  bytes.set([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff]);
  writeAscii(bytes, 4, 'ftyp');
  writeAscii(bytes, 8, majorBrand);
  for (let index = 0; index < compatibleBrands.length; index++) {
    writeAscii(bytes, 16 + index * 4, compatibleBrands[index]);
  }
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < 4; index++) bytes[offset + index] = value.charCodeAt(index);
}
