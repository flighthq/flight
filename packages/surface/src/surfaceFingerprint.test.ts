import { createSurface } from './surface';
import {
  compareSurfaceFingerprints,
  createSurfaceFingerprint,
  formatSurfaceFingerprint,
  parseSurfaceFingerprint,
} from './surfaceFingerprint';
import { setSurfacePixel } from './surfacePixel';

describe('compareSurfaceFingerprints', () => {
  it('reports 0 for identical fingerprints', () => {
    const fp = createSurfaceFingerprint(createSurface(8, 8, 0x336699ff), 4);
    expect(compareSurfaceFingerprints(fp, fp)).toBe(0);
  });

  it('reports the mean absolute per-channel difference', () => {
    const a = createSurfaceFingerprint(createSurface(4, 4, 0x000000ff), 1);
    const b = createSurfaceFingerprint(createSurface(4, 4, 0x0c0c0cff), 1);
    // one cell, RGB all differ by 12 → mean abs diff 12
    expect(compareSurfaceFingerprints(a, b)).toBe(12);
  });

  it('throws when gridSizes differ', () => {
    const a = createSurfaceFingerprint(createSurface(4, 4), 2);
    const b = createSurfaceFingerprint(createSurface(4, 4), 4);
    expect(() => compareSurfaceFingerprints(a, b)).toThrow();
  });

  it('stays small for antialiasing-scale noise but large for a colour swap', () => {
    const base = createSurface(16, 16, 0x2040a0ff);
    const noisy = createSurface(16, 16, 0x2040a0ff);
    setSurfacePixel(noisy, 0, 0, 0x2442a2ff); // a few pixels nudged
    setSurfacePixel(noisy, 5, 5, 0x1e3e9eff);
    const swapped = createSurface(16, 16, 0xa04020ff); // whole image recoloured
    const fp = createSurfaceFingerprint(base, 16);
    expect(compareSurfaceFingerprints(fp, createSurfaceFingerprint(noisy, 16))).toBeLessThan(2);
    expect(compareSurfaceFingerprints(fp, createSurfaceFingerprint(swapped, 16))).toBeGreaterThan(50);
  });
});

describe('createSurfaceFingerprint', () => {
  it('averages a solid surface to that colour in every cell', () => {
    const fp = createSurfaceFingerprint(createSurface(8, 8, 0x336699ff), 4);
    expect(fp.gridSize).toBe(4);
    expect(fp.cells.length).toBe(4 * 4 * 3);
    expect([fp.cells[0], fp.cells[1], fp.cells[2]]).toEqual([0x33, 0x66, 0x99]);
    expect([fp.cells[fp.cells.length - 3], fp.cells[fp.cells.length - 2], fp.cells[fp.cells.length - 1]]).toEqual([
      0x33, 0x66, 0x99,
    ]);
  });

  it('places a coloured quadrant in the matching grid cell', () => {
    const surface = createSurface(2, 2, 0x000000ff);
    setSurfacePixel(surface, 0, 0, 0xff0000ff); // top-left
    const fp = createSurfaceFingerprint(surface, 2);
    expect([fp.cells[0], fp.cells[1], fp.cells[2]]).toEqual([255, 0, 0]); // cell (0,0)
    expect([fp.cells[3], fp.cells[4], fp.cells[5]]).toEqual([0, 0, 0]); // cell (1,0)
  });

  it('throws on a non-positive gridSize', () => {
    expect(() => createSurfaceFingerprint(createSurface(4, 4), 0)).toThrow();
  });

  it('returns an all-zero grid for an empty surface', () => {
    const fp = createSurfaceFingerprint(createSurface(0, 0), 2);
    expect(fp.cells.every((v) => v === 0)).toBe(true);
  });
});

describe('formatSurfaceFingerprint', () => {
  it('round-trips through parseSurfaceFingerprint', () => {
    const surface = createSurface(8, 8, 0x000000ff);
    setSurfacePixel(surface, 1, 1, 0x12ab34ff);
    setSurfacePixel(surface, 6, 6, 0xfe01dcff);
    const fp = createSurfaceFingerprint(surface, 4);
    const parsed = parseSurfaceFingerprint(formatSurfaceFingerprint(fp));
    expect(parsed).not.toBeNull();
    expect(parsed!.gridSize).toBe(4);
    expect(Array.from(parsed!.cells)).toEqual(Array.from(fp.cells));
    expect(compareSurfaceFingerprints(fp, parsed!)).toBe(0);
  });

  it('encodes gridSize and lowercase hex cells', () => {
    const fp = createSurfaceFingerprint(createSurface(4, 4, 0x0a0b0cff), 1);
    expect(formatSurfaceFingerprint(fp)).toBe('1:0a0b0c');
  });
});

describe('parseSurfaceFingerprint', () => {
  it('returns null for malformed text', () => {
    expect(parseSurfaceFingerprint('garbage')).toBeNull();
    expect(parseSurfaceFingerprint('')).toBeNull();
    expect(parseSurfaceFingerprint('2:abcd')).toBeNull(); // wrong cell count for gridSize 2
    expect(parseSurfaceFingerprint('1:0a0b0')).toBeNull(); // odd hex length
    expect(parseSurfaceFingerprint('1:0a0b0z')).toBeNull(); // non-hex digit
  });

  it('parses a valid single-cell fingerprint', () => {
    const parsed = parseSurfaceFingerprint('1:0a0b0c');
    expect(parsed).not.toBeNull();
    expect(Array.from(parsed!.cells)).toEqual([0x0a, 0x0b, 0x0c]);
  });
});
