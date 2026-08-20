import type { CollisionAabb2D, CollisionObb2D } from '@flighthq/types/contract';

// Materializes a box collider as the flat `[x0,y0,...]` vertex list the convex cores consume, so
// AABB, OBB, and polygon all reduce to one representation. Package-internal: these are a detail of
// how the SAT and contact-clipping cores read boxes, not part of the collision API. Both writers
// emit their four corners in consistent winding, which the cores rely on to walk edges in order.

// Writes the four corners of an axis-aligned box into `out` as a flat `[x0,y0,...]` list.
export function writeAabbVertices(aabb: Readonly<CollisionAabb2D>, out: Float64Array): void {
  const minX = aabb.minX;
  const minY = aabb.minY;
  const maxX = aabb.maxX;
  const maxY = aabb.maxY;
  out[0] = minX;
  out[1] = minY;
  out[2] = maxX;
  out[3] = minY;
  out[4] = maxX;
  out[5] = maxY;
  out[6] = minX;
  out[7] = maxY;
}

// Writes the four world-space corners of an oriented box into `out` as a flat `[x0,y0,...]` list.
export function writeObbVertices(obb: Readonly<CollisionObb2D>, out: Float64Array): void {
  const cx = obb.x;
  const cy = obb.y;
  const halfW = obb.halfW;
  const halfH = obb.halfH;
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  const wx = cos * halfW;
  const wy = sin * halfW;
  const hx = -sin * halfH;
  const hy = cos * halfH;
  out[0] = cx - wx - hx;
  out[1] = cy - wy - hy;
  out[2] = cx + wx - hx;
  out[3] = cy + wy - hy;
  out[4] = cx + wx + hx;
  out[5] = cy + wy + hy;
  out[6] = cx - wx + hx;
  out[7] = cy - wy + hy;
}
