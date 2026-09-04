import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Skin2D, EntityConstruction } from '@flighthq/types/contract';

export function createSkin2D(influenceCounts: Uint16Array, influences: Float32Array): Skin2D {
  const out = allocateEntity<Skin2D>();
  initializeSkin2D(out, influenceCounts, influences);
  return finishEntity(out);
}

// Allocates a weight binding over the two streams a caller already owns. The arrays are adopted, not
// copied: an importer builds them once at their final length and hands ownership over, and a deformer
// reads them every frame, so a copy here would be pure waste. A caller that must keep its own copy
// slices before calling.
export function initializeSkin2D(
  out: EntityConstruction<Skin2D>,
  influenceCounts: Uint16Array,
  influences: Float32Array,
): void {
  out.influenceCounts = influenceCounts;
  out.influences = influences;
}
