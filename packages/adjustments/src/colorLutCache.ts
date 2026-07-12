import type { ColorLut, ColorLutCache, ColorTransformFunction } from '@flighthq/types';

import { bakeColorLut, COLOR_LUT_DEFAULT_SIZE } from './colorLut';
import { getAdjustmentColorTransform } from './colorLutAdjustment';

// Bake memo for the LUT-tier fuse: a run of pointwise adjustments is rebuilt with fresh objects every
// frame, so reference identity cannot detect an unchanged grade. Keying by the run's *content* — its
// ops' kinds and serialized params — lets a static grade reuse its baked LUT instead of re-evaluating
// size³ cells each frame, and hands the GPU-upload passes back a stable ColorLut reference so they can
// skip re-uploading too. The bake output is byte-for-byte the uncached result; only the redundant work
// is skipped.

// Bakes the fused `ColorLut` for a pointwise-adjustment run, reusing `cache`'s prior bake when the run's
// content signature is unchanged. On a hit the exact same ColorLut reference is returned (GPU-upload
// caches skip re-uploading by identity); on a miss the run's transforms are composed and baked afresh.
// Matrix-tier members contribute their matrix-as-transform, so a mixed run bakes into one LUT. `size` is
// the per-axis resolution, part of the signature. The bake is deterministic in the run's serialized
// data, so an adjustment carrying hidden non-serialized state in its `transform` would defeat the cache —
// but that violates the data-fed adjustment contract.
export function bakeColorLutForRun(
  cache: ColorLutCache,
  run: ReadonlyArray<Readonly<{ kind: string }>>,
  size: number = COLOR_LUT_DEFAULT_SIZE,
): ColorLut {
  const signature = colorLutRunSignature(run, size);
  if (cache.signature === signature && cache.lut !== null) return cache.lut;
  const transforms: ColorTransformFunction[] = [];
  for (const operation of run) {
    const transform = getAdjustmentColorTransform(operation);
    if (transform !== null) transforms.push(transform);
  }
  const lut = bakeColorLut(transforms, size);
  cache.signature = signature;
  cache.lut = lut;
  return lut;
}

// Allocates an empty bake memo (no baked LUT yet). The effect pipeline owns one and passes it to
// bakeColorLutForRun each frame; it is plain GC-managed memory, so resetting it is dropping the object.
export function createColorLutCache(): ColorLutCache {
  return { signature: null, lut: null };
}

// Content signature of a run for cache keying: the per-axis size plus each op's serialized data fields.
// JSON.stringify drops function-valued properties, so the `transform` closure — rebuilt with fresh
// identity each frame but fully determined by the op's params — is excluded, and two content-identical
// runs hash equal while any changed param re-keys.
function colorLutRunSignature(run: ReadonlyArray<Readonly<{ kind: string }>>, size: number): string {
  return `${size}\n${JSON.stringify(run)}`;
}
