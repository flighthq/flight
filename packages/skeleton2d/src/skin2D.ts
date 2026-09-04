import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Skin2D } from '@flighthq/types/contract';

// Allocates a weight binding over the two streams a caller already owns. The arrays are adopted, not
// copied: an importer builds them once at their final length and hands ownership over, and a deformer
// reads them every frame, so a copy here would be pure waste. A caller that must keep its own copy
// slices before calling.
export function createSkin2D(influenceCounts: Uint16Array, influences: Float32Array): Skin2D {
  const out = allocateEntity<Skin2D>();
  out.influenceCounts = influenceCounts;
  out.influences = influences;
  return finishEntity(out);
}
