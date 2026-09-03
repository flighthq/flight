import { createEntity } from '@flighthq/entity/contract';
import type { CollisionManifold3D } from '@flighthq/types/contract';

// Clears a manifold to the non-overlapping state: `overlapping` false, normal and depth zero. The
// narrow-phase tests call this on their disjoint path, so a reused `out` never carries a stale
// normal into a miss.
export function clearCollisionManifold3D(out: CollisionManifold3D): void {
  out.overlapping = false;
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  out.depth = 0;
}

// Allocates a fresh manifold in the non-overlapping state, ready to be passed as an `out` parameter.
export function createCollisionManifold3D(): CollisionManifold3D {
  return createEntity({ overlapping: false, normalX: 0, normalY: 0, normalZ: 0, depth: 0 });
}
