import type { Surface, SurfaceFingerprint } from '@flighthq/types';

// A coarse downscaled RGB fingerprint: the surface is averaged into a gridSize × gridSize grid, so
// antialiasing jitter that breaks an exact hash washes out while gross changes still register. The
// committed regression baseline is the hex-encoded form (formatSurfaceFingerprint), not a PNG.

const HEX = '0123456789abcdef';

/**
 * The mean absolute per-channel difference (0..255) between two fingerprints of the same gridSize.
 * Threshold it to gate regressions: ~0 is identical, small single digits are antialiasing/noise,
 * large values mean a real visual change. Throws if the gridSizes differ — they are not comparable.
 */
export function compareSurfaceFingerprints(a: Readonly<SurfaceFingerprint>, b: Readonly<SurfaceFingerprint>): number {
  if (a.gridSize !== b.gridSize) {
    throw new Error(`compareSurfaceFingerprints: gridSize mismatch (${a.gridSize} vs ${b.gridSize})`);
  }
  if (a.cells.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.cells.length; i++) sum += Math.abs(a.cells[i] - b.cells[i]);
  return sum / a.cells.length;
}

/**
 * Reduces a surface to a gridSize × gridSize grid of averaged RGB cells. Each cell averages the RGB
 * of the source pixels that fall in it (alpha is ignored — visible colour is what regressions show
 * up in). gridSize controls fidelity vs. text size; the default of 16 catches layout/colour shifts
 * while staying ~1 KB as text. An empty surface yields an all-zero grid.
 */
export function createSurfaceFingerprint(source: Readonly<Surface>, gridSize: number = 16): SurfaceFingerprint {
  if (gridSize < 1) throw new Error(`createSurfaceFingerprint: gridSize must be >= 1 (got ${gridSize})`);

  const cells = new Uint8Array(gridSize * gridSize * 3);
  const { width, height, data } = source;
  if (width === 0 || height === 0) return { gridSize, cells };

  for (let cy = 0; cy < gridSize; cy++) {
    const y0 = Math.floor((cy * height) / gridSize);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / gridSize));
    for (let cx = 0; cx < gridSize; cx++) {
      const x0 = Math.floor((cx * width) / gridSize);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / gridSize));
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < x1 && x < width; x++) {
          sumR += data[i];
          sumG += data[i + 1];
          sumB += data[i + 2];
          count++;
          i += 4;
        }
      }
      const c = (cy * gridSize + cx) * 3;
      cells[c] = count === 0 ? 0 : Math.round(sumR / count);
      cells[c + 1] = count === 0 ? 0 : Math.round(sumG / count);
      cells[c + 2] = count === 0 ? 0 : Math.round(sumB / count);
    }
  }
  return { gridSize, cells };
}

/**
 * Serializes a fingerprint to a compact, git-diffable text line: `<gridSize>:<hex cells>`. This is
 * what gets committed as a regression baseline instead of a screenshot.
 */
export function formatSurfaceFingerprint(fingerprint: Readonly<SurfaceFingerprint>): string {
  const cells = fingerprint.cells;
  let hex = '';
  for (let i = 0; i < cells.length; i++) {
    hex += HEX[(cells[i] >> 4) & 0xf] + HEX[cells[i] & 0xf];
  }
  return `${fingerprint.gridSize}:${hex}`;
}

/**
 * Parses the text form produced by formatSurfaceFingerprint. Returns `null` for malformed input
 * (wrong shape, odd hex length, or a cell count that is not gridSize × gridSize × 3) so callers can
 * treat a corrupt baseline as "no baseline" rather than crashing.
 */
export function parseSurfaceFingerprint(text: string): SurfaceFingerprint | null {
  const colon = text.indexOf(':');
  if (colon <= 0) return null;
  const gridSize = Number.parseInt(text.slice(0, colon), 10);
  if (!Number.isInteger(gridSize) || gridSize < 1) return null;

  const hex = text.slice(colon + 1);
  if (hex.length !== gridSize * gridSize * 3 * 2) return null;

  const cells = new Uint8Array(hex.length / 2);
  for (let i = 0; i < cells.length; i++) {
    const hi = HEX.indexOf(hex[i * 2]);
    const lo = HEX.indexOf(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return null;
    cells[i] = (hi << 4) | lo;
  }
  return { gridSize, cells };
}
