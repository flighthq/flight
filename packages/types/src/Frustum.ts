import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Plane } from './Plane';

// A view frustum as its six bounding planes, each oriented with its normal pointing inward
// (toward the contained volume) so a point is inside the frustum when its signed distance to
// every plane is >= 0. Built from a view-projection Matrix4 (setFrustumFromMatrix4) and
// tested against bounds (isFrustumIntersectingAabb).
export interface Frustum extends Entity {
  bottom: Plane;
  far: Plane;
  left: Plane;
  near: Plane;
  right: Plane;
  top: Plane;
}

export type FrustumLike = EntityWithoutRuntime<Frustum>;
