import type { SurfaceRegion } from '@flighthq/types';

/**
 * Transitions `dest` toward `source` one batch of pixels at a time, in a
 * deterministic pseudo-random order — the classic dissolve wipe. Each call
 * dissolves up to `pixelCount` not-yet-dissolved pixels and returns the next
 * seed; pass that value back on the following call to continue the wipe without
 * revisiting any pixel. Start a fresh dissolve with `seed = 0`. Once every pixel
 * has dissolved the returned seed is terminal: further calls with it are no-ops.
 *
 * `seed` is an opaque progress cursor over a fixed permutation of the region's
 * pixels, not a color or coordinate. The dissolve order is fully deterministic
 * in the region's dimensions.
 *
 * When `source` is the same region as `dest` (same surface and identical
 * bounds), dissolved pixels are set to `fillColor` (packed `0xRRGGBBAA`);
 * otherwise each is copied from the matching pixel in
 * `source` and `fillColor` is ignored. Pixels that fall outside the surface are
 * clipped but still consume a step of the sequence.
 */
export function dissolveSurfacePixels(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  seed: number,
  pixelCount: number,
  fillColor: number = 0,
): number {
  const width = dest.width;
  const height = dest.height;
  const total = width * height;
  if (total <= 0) return seed;

  let bits = 0;
  while (1 << bits < total) bits++;
  const period = 1 << bits;
  const mask = period - 1;

  let cursor = seed < 0 ? 0 : seed > period ? period : seed | 0;
  if (pixelCount <= 0) return cursor;

  const toFill =
    source.surface === dest.surface &&
    source.x === dest.x &&
    source.y === dest.y &&
    source.width === dest.width &&
    source.height === dest.height;
  const fillR = (fillColor >>> 24) & 0xff;
  const fillG = (fillColor >> 16) & 0xff;
  const fillB = (fillColor >> 8) & 0xff;
  const fillA = fillColor & 0xff;

  const destData = dest.surface.data;
  const destStride = dest.surface.width;
  const destSurfaceHeight = dest.surface.height;
  const sourceData = source.surface.data;
  const sourceStride = source.surface.width;
  const sourceSurfaceHeight = source.surface.height;

  let dissolved = 0;
  while (dissolved < pixelCount && cursor < period) {
    const pixelIndex = permutePixelIndex(cursor, bits, mask);
    cursor++;
    if (pixelIndex >= total) continue;
    dissolved++;

    const px = pixelIndex % width;
    const py = (pixelIndex / width) | 0;
    const dx = dest.x + px;
    const dy = dest.y + py;
    if (dx < 0 || dx >= destStride || dy < 0 || dy >= destSurfaceHeight) continue;
    const di = (dy * destStride + dx) * 4;

    if (toFill) {
      destData[di] = fillR;
      destData[di + 1] = fillG;
      destData[di + 2] = fillB;
      destData[di + 3] = fillA;
      continue;
    }

    const sx = source.x + px;
    const sy = source.y + py;
    if (sx < 0 || sx >= sourceStride || sy < 0 || sy >= sourceSurfaceHeight) continue;
    const si = (sy * sourceStride + sx) * 4;
    destData[di] = sourceData[si];
    destData[di + 1] = sourceData[si + 1];
    destData[di + 2] = sourceData[si + 2];
    destData[di + 3] = sourceData[si + 3];
  }

  return cursor;
}

// Bijection on [0, 2^bits): a composition of multiply-by-odd (invertible mod
// 2^bits), xor-shift, and xor-constant, each individually reversible. Walking
// `cursor` across the full period therefore visits every index in [0, total)
// exactly once (cycle-walking skips the indices >= total), which is what
// guarantees a dissolve eventually covers the whole region without repeats.
function permutePixelIndex(cursor: number, bits: number, mask: number): number {
  let v = cursor & mask;
  const shift = bits > 1 ? bits >> 1 : 1;
  v = Math.imul(v, 0x9e3779b1) & mask;
  v ^= v >>> shift;
  v = Math.imul(v, 0x85ebca77) & mask;
  v ^= 0x27d4eb2f & mask;
  return v & mask;
}
