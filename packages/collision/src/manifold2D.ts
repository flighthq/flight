import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CollisionManifold2D } from '@flighthq/types/contract';

// Clears a manifold to the non-overlapping state: `overlapping` false, normal and depth zero. The
// narrow-phase tests call this on their disjoint path, so a reused `out` never carries a stale
// normal into a miss.
export function clearCollisionManifold2D(out: CollisionManifold2D): void {
  out.overlapping = false;
  out.normalX = 0;
  out.normalY = 0;
  out.depth = 0;
}

// Allocates a fresh manifold in the non-overlapping state, ready to be passed as an `out` parameter.
export function createCollisionManifold2D(): CollisionManifold2D {
  const out = allocateEntity<CollisionManifold2D>();
  out.overlapping = false;
  out.normalX = 0;
  out.normalY = 0;
  out.depth = 0;
  return finishEntity(out);
}
