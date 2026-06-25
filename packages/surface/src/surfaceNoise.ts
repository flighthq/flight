import { invalidateImageResource } from '@flighthq/image';
import type { SurfaceRegion } from '@flighthq/types';

/**
 * Fills the `dest` region with uniform random noise in `[low, high]`, derived
 * deterministically from `seed` (the same seed always produces the same image,
 * which a `Math.random()` fill could not guarantee — important for reproducible
 * tests and a future C port). Region pixels outside the surface are skipped.
 *
 * When `grayScale` is true, R, G, and B share one value per pixel; otherwise
 * each channel is independent. Alpha is set fully opaque (255).
 */
export function fillSurfaceNoise(
  dest: Readonly<SurfaceRegion>,
  seed: number,
  low: number = 0,
  high: number = 255,
  grayScale: boolean = false,
): void {
  let state = (seed | 0) >>> 0 || 1;
  const lo = Math.max(0, Math.min(255, low));
  const span = Math.max(0, Math.min(255, high)) - lo;
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    for (let px = 0; px < dest.width; px++) {
      // Advance the generator for every region pixel so the field stays
      // deterministic regardless of which pixels fall outside the surface.
      state = nextRandomState(state);
      const r = lo + (state / 0x100000000) * span;
      let g = r;
      let b = r;
      if (!grayScale) {
        state = nextRandomState(state);
        g = lo + (state / 0x100000000) * span;
        state = nextRandomState(state);
        b = lo + (state / 0x100000000) * span;
      }
      const x = dest.x + px;
      if (y < 0 || y >= dest.surface.height || x < 0 || x >= surfaceWidth) continue;
      const i = (y * surfaceWidth + x) * 4;
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
      data[i + 3] = 255;
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Fills `out` with fractal value noise summed over `octaves`. `baseX` and
 * `baseY` are the wavelengths (in pixels) of the first octave: larger values
 * produce smoother, lower-frequency noise. Each successive octave doubles the
 * frequency and halves the amplitude. Output is normalized to 0..255.
 *
 * - `baseX`, `baseY`: wavelengths in pixels of the first octave (larger = smoother).
 * - `octaves`: number of frequency doublings (1 = smooth; higher = more detail).
 * - `seed`: deterministic integer seed.
 * - `stitch`: when `true`, the noise field tiles seamlessly at the region borders.
 * - `grayScale`: when `true`, R=G=B share one noise channel. Overrides
 *   `channelOptions` for the RGB channels.
 * - `channelOptions`: bitmask of channels to fill (default `0x7` = RGB, matching
 *   OpenFL's `perlinNoise` default). Channels not selected are left unchanged in
 *   `dest`, except alpha: when the A bit is not selected, alpha is set opaque
 *   (255) rather than left as-is. Use `SURFACE_NOISE_CHANNEL_*` constants. When
 *   `grayScale` is true the same field drives all selected RGB channels.
 *
 * Output range is normalized to 0..255. Alpha defaults to 255 unless the A
 * bit is explicitly included in `channelOptions`.
 */
export function fillSurfacePerlinNoise(
  dest: Readonly<SurfaceRegion>,
  baseX: number,
  baseY: number,
  octaves: number,
  seed: number,
  grayScale: boolean = false,
  stitch: boolean = false,
  channelOptions: number = 0x7,
): void {
  const fx0 = baseX > 0 ? 1 / baseX : 0;
  const fy0 = baseY > 0 ? 1 / baseY : 0;
  const passes = Math.max(1, Math.round(octaves));
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  const w = dest.width;
  const h = dest.height;
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const di = (y * surfaceWidth + x) * 4;

      const nx = stitch ? stitchedCoord(px * fx0, w * fx0) : px * fx0;
      const ny = stitch ? stitchedCoord(py * fy0, h * fy0) : py * fy0;

      if (grayScale) {
        const value = fractalValueNoise(nx, ny, passes, seed | 0);
        const byte = Math.round(value * 255);
        if (channelOptions & SURFACE_NOISE_CHANNEL_R) data[di] = byte;
        if (channelOptions & SURFACE_NOISE_CHANNEL_G) data[di + 1] = byte;
        if (channelOptions & SURFACE_NOISE_CHANNEL_B) data[di + 2] = byte;
      } else {
        if (channelOptions & SURFACE_NOISE_CHANNEL_R) {
          data[di] = Math.round(fractalValueNoise(nx, ny, passes, seed | 0) * 255);
        }
        if (channelOptions & SURFACE_NOISE_CHANNEL_G) {
          data[di + 1] = Math.round(fractalValueNoise(nx, ny, passes, (seed | 0) + 0x9e3779b1) * 255);
        }
        if (channelOptions & SURFACE_NOISE_CHANNEL_B) {
          data[di + 2] = Math.round(fractalValueNoise(nx, ny, passes, (seed | 0) + 0x9e3779b2) * 255);
        }
      }
      if (channelOptions & SURFACE_NOISE_CHANNEL_A) {
        data[di + 3] = Math.round(fractalValueNoise(nx, ny, passes, (seed | 0) + 0x9e3779b3) * 255);
      } else {
        data[di + 3] = 255;
      }
    }
  }
  invalidateImageResource(dest.surface);
}

/**
 * Fills `dest` with fractal **turbulence** (absolute-value fBm) value noise,
 * matching OpenFL's `BitmapData.perlinNoise` with `fractalNoise: false`.
 * Turbulence sums `abs(octave)` values, producing a more vigorous, ridge-like
 * texture than the smooth fractal sum.
 *
 * Parameters are identical to `fillSurfacePerlinNoise` except there is no
 * `fractalNoise` flag (this function _is_ the turbulence variant).
 */
export function fillSurfaceTurbulence(
  dest: Readonly<SurfaceRegion>,
  baseX: number,
  baseY: number,
  octaves: number,
  seed: number,
  grayScale: boolean = false,
  stitch: boolean = false,
  channelOptions: number = 0x7,
): void {
  const fx0 = baseX > 0 ? 1 / baseX : 0;
  const fy0 = baseY > 0 ? 1 / baseY : 0;
  const passes = Math.max(1, Math.round(octaves));
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  const w = dest.width;
  const h = dest.height;

  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const di = (y * surfaceWidth + x) * 4;

      const nx = stitch ? stitchedCoord(px * fx0, w * fx0) : px * fx0;
      const ny = stitch ? stitchedCoord(py * fy0, h * fy0) : py * fy0;

      if (grayScale) {
        const value = turbulenceNoise(nx, ny, passes, seed | 0);
        const byte = Math.round(value * 255);
        if (channelOptions & SURFACE_NOISE_CHANNEL_R) data[di] = byte;
        if (channelOptions & SURFACE_NOISE_CHANNEL_G) data[di + 1] = byte;
        if (channelOptions & SURFACE_NOISE_CHANNEL_B) data[di + 2] = byte;
      } else {
        if (channelOptions & SURFACE_NOISE_CHANNEL_R) {
          data[di] = Math.round(turbulenceNoise(nx, ny, passes, seed | 0) * 255);
        }
        if (channelOptions & SURFACE_NOISE_CHANNEL_G) {
          data[di + 1] = Math.round(turbulenceNoise(nx, ny, passes, (seed | 0) + 0x9e3779b1) * 255);
        }
        if (channelOptions & SURFACE_NOISE_CHANNEL_B) {
          data[di + 2] = Math.round(turbulenceNoise(nx, ny, passes, (seed | 0) + 0x9e3779b2) * 255);
        }
      }
      if (channelOptions & SURFACE_NOISE_CHANNEL_A) {
        data[di + 3] = Math.round(turbulenceNoise(nx, ny, passes, (seed | 0) + 0x9e3779b3) * 255);
      } else {
        data[di + 3] = 255;
      }
    }
  }
  invalidateImageResource(dest.surface);
}

export const SURFACE_NOISE_CHANNEL_A = 0x8;
export const SURFACE_NOISE_CHANNEL_B = 0x4;
export const SURFACE_NOISE_CHANNEL_G = 0x2;
export const SURFACE_NOISE_CHANNEL_R = 0x1;

// Fractal sum of value noise: doubling frequency, halving amplitude per octave,
// normalized back to 0..1 by the total amplitude.
function fractalValueNoise(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let amplitudeSum = 0;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * frequency, y * frequency, seed + o * 0x85ebca6b) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return amplitudeSum > 0 ? sum / amplitudeSum : 0;
}

// Integer hash to a deterministic 0..1 value; the lattice corners of valueNoise.
function hashLattice(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

// Mulberry32 step: maps one 32-bit state to the next, used as an unsigned int.
function nextRandomState(state: number): number {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0 || 1;
}

// Smoothstep, so lattice cells blend without visible seams.
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Wraps t into [0, period) so that integer lattice indices repeat, producing seamless tiling.
function stitchedCoord(t: number, period: number): number {
  if (period <= 0) return t;
  return ((t % period) + period) % period;
}

// Fractal turbulence: abs(2*v - 1) fBm, producing a more vigorous ridge-like texture than
// the smooth fractal sum (matches OpenFL perlinNoise with fractalNoise=false).
function turbulenceNoise(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let amplitudeSum = 0;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    sum += Math.abs(valueNoise(x * frequency, y * frequency, seed + o * 0x85ebca6b) * 2 - 1) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return amplitudeSum > 0 ? sum / amplitudeSum : 0;
}

// Bilinearly-interpolated lattice hash — one octave of value noise in 0..1.
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothStep(x - ix);
  const fy = smoothStep(y - iy);
  const v00 = hashLattice(ix, iy, seed);
  const v10 = hashLattice(ix + 1, iy, seed);
  const v01 = hashLattice(ix, iy + 1, seed);
  const v11 = hashLattice(ix + 1, iy + 1, seed);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}
