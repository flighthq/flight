import { invalidateImageResource } from '@flighthq/image';
import type { GradientSpread, SurfaceRegion } from '@flighthq/types';

/**
 * Fills the `dest` region with a linear gradient defined by two points `(x0, y0)`
 * and `(x1, y1)` in region-local coordinates. Each pixel's position along the
 * gradient axis maps to a ramp index (0–255), which is looked up in the 256-entry
 * RGBA `ramp` (1024 bytes). Build the ramp with `buildSurfaceGradientRamp`.
 *
 * `spread` controls what happens outside the axis span:
 * - `'pad'` (default): extends the first or last stop color.
 * - `'repeat'`: tiles the gradient.
 * - `'reflect'`: mirrors the gradient alternately.
 *
 * Pixels outside the surface bounds are skipped.
 */
export function fillSurfaceLinearGradient(
  dest: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spread: GradientSpread = 'pad',
): void {
  const dw = dest.width;
  const dh = dest.height;
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  const surfaceHeight = dest.surface.height;
  const axisX = x1 - x0;
  const axisY = y1 - y0;
  const lenSq = axisX * axisX + axisY * axisY;
  const invLen = lenSq > 0 ? 1 / lenSq : 0;
  for (let py = 0; py < dh; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= surfaceHeight) continue;
    for (let px = 0; px < dw; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      // Project pixel onto gradient axis → t in [0, 1] maps x0→x1.
      const t = ((px - x0) * axisX + (py - y0) * axisY) * invLen;
      const idx = spreadIndex(t, spread);
      const ri = idx * 4;
      const i = (y * surfaceWidth + x) * 4;
      data[i] = ramp[ri];
      data[i + 1] = ramp[ri + 1];
      data[i + 2] = ramp[ri + 2];
      data[i + 3] = ramp[ri + 3];
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Fills the `dest` region with a radial gradient centered at `(cx, cy)` in
 * region-local coordinates with the given `radius`. An optional focal point
 * `(focalX, focalY)` shifts the gradient origin (defaults to the center).
 * Each pixel's normalized distance maps to a ramp index (0–255), looked up in
 * the 256-entry RGBA `ramp` (1024 bytes). Build the ramp with
 * `buildSurfaceGradientRamp`.
 *
 * `spread` controls what happens outside the radius:
 * - `'pad'` (default): extends the last stop color.
 * - `'repeat'`: tiles the gradient.
 * - `'reflect'`: mirrors the gradient alternately.
 *
 * Pixels outside the surface bounds are skipped.
 */
export function fillSurfaceRadialGradient(
  dest: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  cx: number,
  cy: number,
  radius: number,
  focalX: number = cx,
  focalY: number = cy,
  spread: GradientSpread = 'pad',
): void {
  const dw = dest.width;
  const dh = dest.height;
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  const surfaceHeight = dest.surface.height;
  const invRadius = radius > 0 ? 1 / radius : 0;
  // Focal-point offset from center.
  const fdx = focalX - cx;
  const fdy = focalY - cy;
  for (let py = 0; py < dh; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= surfaceHeight) continue;
    for (let px = 0; px < dw; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      // Distance from focal point, normalized by radius → t in [0, 1].
      const dx = px - focalX;
      const dy = py - focalY;
      // Use the cone-ray formula for two-point focal gradient (standard SVG model).
      // When focal === center this simplifies to Euclidean distance / radius.
      const t = Math.sqrt(dx * dx + dy * dy) * invRadius - (dx * fdx + dy * fdy) * invRadius * invRadius;
      const idx = spreadIndex(t, spread);
      const ri = idx * 4;
      const i = (y * surfaceWidth + x) * 4;
      data[i] = ramp[ri];
      data[i + 1] = ramp[ri + 1];
      data[i + 2] = ramp[ri + 2];
      data[i + 3] = ramp[ri + 3];
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Converts a normalized gradient parameter `t` (range [0, 1]) into a ramp
 * index (0–255), applying the requested `spread` mode for values outside [0, 1].
 */
function spreadIndex(t: number, spread: GradientSpread): number {
  let s: number;
  switch (spread) {
    case 'repeat': {
      s = t - Math.floor(t);
      break;
    }
    case 'reflect': {
      const wrapped = t - Math.floor(t / 2) * 2;
      s = wrapped <= 1 ? wrapped : 2 - wrapped;
      break;
    }
    default: {
      // 'pad'
      s = Math.max(0, Math.min(1, t));
      break;
    }
  }
  return Math.min(255, Math.round(s * 255));
}
