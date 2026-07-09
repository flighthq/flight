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

  it('detects BMP', () => {
    const buf = new ArrayBuffer(16);
    new Uint8Array(buf).set([0x42, 0x4d]);
    expect(detectImageMimeType(buf)).toBe('image/bmp');
  });

  it('accepts a Uint8Array directly', () => {
    expect(detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
  });
});
