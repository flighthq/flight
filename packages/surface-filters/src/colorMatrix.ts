import type { SurfaceRegion } from '@flighthq/types';

// 4×5 color matrices are row-major: 4 rows (R, G, B, A output), each with 5
// columns (R, G, B, A multipliers + a constant offset in 0..255 units).

/**
 * Applies a 4×5 color matrix to `source` and writes into `out`.
 * `out` must be at least `source.width * source.height * 4` bytes.
 *
 * Safe to pass `source.surface.data` as `out` when the region covers the
 * full surface — each pixel's input channels are read before any channel
 * of that pixel is written.
 */
export function applySurfaceColorMatrixFilter(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  matrix: ReadonlyArray<number>,
): void {
  if (matrix.length < 20) throw new Error('Color matrix filter requires 20 values');

  for (let py = 0; py < source.height; py++) {
    const sourceY = source.y + py;
    if (sourceY < 0 || sourceY >= source.surface.height) continue;
    for (let px = 0; px < source.width; px++) {
      const sourceX = source.x + px;
      if (sourceX < 0 || sourceX >= source.surface.width) continue;
      const si = (sourceY * source.surface.width + sourceX) * 4;
      const di = (py * source.width + px) * 4;
      const r = source.surface.data[si];
      const g = source.surface.data[si + 1];
      const b = source.surface.data[si + 2];
      const a = source.surface.data[si + 3];
      out[di] = clampByte(r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4]);
      out[di + 1] = clampByte(r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9]);
      out[di + 2] = clampByte(r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14]);
      out[di + 3] = clampByte(r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19]);
    }
  }
}

/**
 * Writes a brightness color matrix into `out` (length 20). Multiplies RGB by
 * `amount` (CSS `brightness()` semantics): 1 is identity, 0 is black, >1 brightens.
 */
export function buildBrightnessColorMatrix(out: number[], amount: number): void {
  setColorMatrix(out, amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, amount, 0, 0, 0, 0, 0, 1, 0);
}

/**
 * Writes a contrast color matrix into `out` (length 20). Scales RGB around the
 * midpoint (CSS `contrast()` semantics): 1 is identity, 0 is flat grey, >1 raises
 * contrast.
 */
export function buildContrastColorMatrix(out: number[], amount: number): void {
  const t = 127.5 * (1 - amount);
  setColorMatrix(out, amount, 0, 0, 0, t, 0, amount, 0, 0, t, 0, 0, amount, 0, t, 0, 0, 0, 1, 0);
}

/**
 * Writes a grayscale color matrix into `out` (length 20). Equivalent to
 * `buildSaturationColorMatrix(out, 0)`; uses the W3C luma coefficients.
 */
export function buildGrayscaleColorMatrix(out: number[]): void {
  buildSaturationColorMatrix(out, 0);
}

/**
 * Writes a hue-rotation color matrix into `out` (length 20). `degrees` rotates
 * hue around the luma axis (CSS `hue-rotate()` semantics, W3C coefficients).
 * 0° is identity; 180° inverts hue; values outside 0..360 wrap naturally.
 */
export function buildHueRotationColorMatrix(out: number[], degrees: number): void {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  setColorMatrix(
    out,
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0,
    0,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0,
    0,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  );
}

/**
 * Writes an invert color matrix into `out` (length 20). Inverts RGB
 * (`255 - channel`); alpha is preserved.
 */
export function buildInvertColorMatrix(out: number[]): void {
  setColorMatrix(out, -1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0);
}

/**
 * Writes a saturation color matrix into `out` (length 20). `amount` is 1 for
 * identity, 0 for grayscale, >1 for oversaturated (CSS `saturate()` semantics,
 * W3C luma coefficients).
 */
export function buildSaturationColorMatrix(out: number[], amount: number): void {
  const inv = 1 - amount;
  const r = LUMA_R * inv;
  const g = LUMA_G * inv;
  const b = LUMA_B * inv;
  setColorMatrix(out, r + amount, g, b, 0, 0, r, g + amount, b, 0, 0, r, g, b + amount, 0, 0, 0, 0, 0, 1, 0);
}

/**
 * Writes a sepia color matrix into `out` (length 20), matching CSS `sepia(1)`.
 */
export function buildSepiaColorMatrix(out: number[]): void {
  setColorMatrix(out, 0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0);
}

/**
 * Composes two 4×5 color matrices into `out` (length 20): the result applies
 * `first`, then `second`. `out` must not alias `first` or `second`.
 */
export function concatColorMatrix(out: number[], first: ReadonlyArray<number>, second: ReadonlyArray<number>): void {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = col === 4 ? second[row * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) {
        sum += second[row * 5 + k] * (col === 4 ? first[k * 5 + 4] : first[k * 5 + col]);
      }
      out[row * 5 + col] = sum;
    }
  }
}

/**
 * Writes the identity color matrix into `out` (length 20).
 */
export function setColorMatrixIdentity(out: number[]): void {
  setColorMatrix(out, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0);
}

// W3C luma coefficients (matching CSS saturate/grayscale), so the CPU result
// agrees with the eventual CSS filter backend.
const LUMA_R = 0.213;
const LUMA_G = 0.715;
const LUMA_B = 0.072;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function setColorMatrix(out: number[], ...values: number[]): void {
  for (let i = 0; i < 20; i++) out[i] = values[i];
}
