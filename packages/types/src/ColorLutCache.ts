import type { ColorLut } from './ColorLut';

// A single-slot memo of the fused color LUT for a run of pointwise adjustments, so a static grade does
// not re-bake its size³ cells every frame. `signature` is the run's content key — its ops' kinds and
// serialized params, with the `transform` closures excluded (an adjustment must be fully determined by
// its serialized data, the data-fed contract) — and `lut` is the ColorLut baked for that signature,
// reused by reference on a hit so GPU-upload caches can skip re-uploading by identity. Owned by the
// effect pipeline; plain GC-managed memory, so resetting it is dropping the references. See
// bakeColorLutForRun in @flighthq/adjustments.
export interface ColorLutCache {
  signature: string | null;
  lut: ColorLut | null;
}
