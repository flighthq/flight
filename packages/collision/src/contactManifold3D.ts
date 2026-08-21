import type { CollisionContactManifold3D } from '@flighthq/types/contract';
import { MAX_COLLISION_CONTACT_POINTS_3D } from '@flighthq/types/contract';

// Clears a contact manifold to the non-overlapping state. The point array keeps its identity and its
// length — only `pointCount` goes to zero — so a caller holding a reference to a point across a miss
// still holds a live object, and the next hit refills it without allocating.
export function clearCollisionContactManifold3D(out: CollisionContactManifold3D): void {
  out.overlapping = false;
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  out.pointCount = 0;
}

// Allocates a contact manifold with its full point array already built, in the non-overlapping state.
//
// The points are allocated ONCE here rather than per contact, which is the whole reason this
// constructor exists: a narrow phase runs over thousands of pairs a frame, and a manifold that grew
// its own points would allocate on every one of them. Entries beyond `pointCount` hold stale values by
// design and must not be read.
export function createCollisionContactManifold3D(): CollisionContactManifold3D {
  const points = [];
  for (let i = 0; i < MAX_COLLISION_CONTACT_POINTS_3D; i += 1) {
    points.push({ x: 0, y: 0, z: 0, depth: 0, featureId: 0 });
  }
  return { overlapping: false, normalX: 0, normalY: 0, normalZ: 0, pointCount: 0, points };
}
