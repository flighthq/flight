import { invalidateImageSource } from '@flighthq/assets';
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
  invalidateImageSource(dest.surface);
}

/**
 * Fills `out` with fractal value noise summed over `octaves`. `baseX` and
 * `baseY` are the wavelengths (in pixels) of the first octave: larger values
 * produce smoother, lower-frequency noise. Each successive octave doubles the
 * frequency and halves the amplitude. Output is normalized to 0..255.
 *
 * When `grayScale` is true the same noise drives R, G, and B; otherwise each
 * channel uses an independent noise field. Alpha is set fully opaque (255).
 * Deterministic in `seed`.
 */
export function fillSurfacePerlinNoise(
  dest: Readonly<SurfaceRegion>,
  baseX: number,
  baseY: number,
  octaves: number,
  seed: number,
  grayScale: boolean = false,
): void {
  const fx0 = baseX > 0 ? 1 / baseX : 0;
  const fy0 = baseY > 0 ? 1 / baseY : 0;
  const passes = Math.max(1, Math.round(octaves));
  const channels = grayScale ? 1 : 3;
  const data = dest.surface.data;
  const surfaceWidth = dest.surface.width;
  for (let py = 0; py < dest.height; py++) {
    const y = dest.y + py;
    if (y < 0 || y >= dest.surface.height) continue;
    for (let px = 0; px < dest.width; px++) {
      const x = dest.x + px;
      if (x < 0 || x >= surfaceWidth) continue;
      const di = (y * surfaceWidth + x) * 4;
      for (let c = 0; c < channels; c++) {
        const value = fractalValueNoise(px * fx0, py * fy0, passes, (seed | 0) + c * 0x9e3779b1);
        const byte = Math.round(value * 255);
        if (grayScale) {
          data[di] = byte;
          data[di + 1] = byte;
          data[di + 2] = byte;
        } else {
          data[di + c] = byte;
        }
      }
      data[di + 3] = 255;
    }
  }
  invalidateImageSource(dest.surface);
}

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
