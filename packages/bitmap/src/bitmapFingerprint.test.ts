import { createBitmap } from './bitmap';
import {
  BITMAP_FINGERPRINT_COMPUTATION_ID,
  compareBitmapFingerprints,
  createBitmapFingerprint,
  formatBitmapFingerprint,
  parseBitmapFingerprint,
} from './bitmapFingerprint';
import { setBitmapPixel } from './bitmapPixel';

describe('BITMAP_FINGERPRINT_COMPUTATION_ID', () => {
  it('is a non-empty string identifying the current computation', () => {
    expect(typeof BITMAP_FINGERPRINT_COMPUTATION_ID).toBe('string');
    expect(BITMAP_FINGERPRINT_COMPUTATION_ID.length).toBeGreaterThan(0);
  });
});

describe('compareBitmapFingerprints', () => {
  it('reports 0 for identical fingerprints', () => {
    const fp = createBitmapFingerprint(createBitmap(8, 8, 0x336699ff), 4);
    expect(compareBitmapFingerprints(fp, fp)).toBe(0);
  });

  it('reports the mean absolute per-channel difference', () => {
    const a = createBitmapFingerprint(createBitmap(4, 4, 0x000000ff), 1);
    const b = createBitmapFingerprint(createBitmap(4, 4, 0x0c0c0cff), 1);
    // one cell, RGB all differ by 12 → mean abs diff 12
    expect(compareBitmapFingerprints(a, b)).toBe(12);
  });

  it('throws when gridSizes differ', () => {
    const a = createBitmapFingerprint(createBitmap(4, 4), 2);
    const b = createBitmapFingerprint(createBitmap(4, 4), 4);
    expect(() => compareBitmapFingerprints(a, b)).toThrow();
  });

  it('stays small for antialiasing-scale noise but large for a colour swap', () => {
    const base = createBitmap(16, 16, 0x2040a0ff);
    const noisy = createBitmap(16, 16, 0x2040a0ff);
    setBitmapPixel(noisy, 0, 0, 0x2442a2ff); // a few pixels nudged
    setBitmapPixel(noisy, 5, 5, 0x1e3e9eff);
    const swapped = createBitmap(16, 16, 0xa04020ff); // whole image recoloured
    const fp = createBitmapFingerprint(base, 16);
    expect(compareBitmapFingerprints(fp, createBitmapFingerprint(noisy, 16))).toBeLessThan(2);
    expect(compareBitmapFingerprints(fp, createBitmapFingerprint(swapped, 16))).toBeGreaterThan(50);
  });
});

describe('createBitmapFingerprint', () => {
  it('averages a solid bitmap to that colour in every cell', () => {
    const fp = createBitmapFingerprint(createBitmap(8, 8, 0x336699ff), 4);
    expect(fp.gridSize).toBe(4);
    expect(fp.cells.length).toBe(4 * 4 * 3);
    expect([fp.cells[0], fp.cells[1], fp.cells[2]]).toEqual([0x33, 0x66, 0x99]);
    expect([fp.cells[fp.cells.length - 3], fp.cells[fp.cells.length - 2], fp.cells[fp.cells.length - 1]]).toEqual([
      0x33, 0x66, 0x99,
    ]);
  });

  it('places a coloured quadrant in the matching grid cell', () => {
    const bitmap = createBitmap(2, 2, 0x000000ff);
    setBitmapPixel(bitmap, 0, 0, 0xff0000ff); // top-left
    const fp = createBitmapFingerprint(bitmap, 2);
    expect([fp.cells[0], fp.cells[1], fp.cells[2]]).toEqual([255, 0, 0]); // cell (0,0)
    expect([fp.cells[3], fp.cells[4], fp.cells[5]]).toEqual([0, 0, 0]); // cell (1,0)
  });

  it('throws on a non-positive gridSize', () => {
    expect(() => createBitmapFingerprint(createBitmap(4, 4), 0)).toThrow();
  });

  it('returns an all-zero grid for an empty bitmap', () => {
    const fp = createBitmapFingerprint(createBitmap(0, 0), 2);
    expect(fp.cells.every((v) => v === 0)).toBe(true);
  });
});

describe('formatBitmapFingerprint', () => {
  it('round-trips through parseBitmapFingerprint', () => {
    const bitmap = createBitmap(8, 8, 0x000000ff);
    setBitmapPixel(bitmap, 1, 1, 0x12ab34ff);
    setBitmapPixel(bitmap, 6, 6, 0xfe01dcff);
    const fp = createBitmapFingerprint(bitmap, 4);
    const parsed = parseBitmapFingerprint(formatBitmapFingerprint(fp));
    expect(parsed).not.toBeNull();
    expect(parsed!.gridSize).toBe(4);
    expect(Array.from(parsed!.cells)).toEqual(Array.from(fp.cells));
    expect(compareBitmapFingerprints(fp, parsed!)).toBe(0);
  });

  it('encodes gridSize and lowercase hex cells', () => {
    const fp = createBitmapFingerprint(createBitmap(4, 4, 0x0a0b0cff), 1);
    expect(formatBitmapFingerprint(fp)).toBe('1:0a0b0c');
  });
});

describe('parseBitmapFingerprint', () => {
  it('returns null for malformed text', () => {
    expect(parseBitmapFingerprint('garbage')).toBeNull();
    expect(parseBitmapFingerprint('')).toBeNull();
    expect(parseBitmapFingerprint('2:abcd')).toBeNull(); // wrong cell count for gridSize 2
    expect(parseBitmapFingerprint('1:0a0b0')).toBeNull(); // odd hex length
    expect(parseBitmapFingerprint('1:0a0b0z')).toBeNull(); // non-hex digit
  });

  it('parses a valid single-cell fingerprint', () => {
    const parsed = parseBitmapFingerprint('1:0a0b0c');
    expect(parsed).not.toBeNull();
    expect(Array.from(parsed!.cells)).toEqual([0x0a, 0x0b, 0x0c]);
  });
});
