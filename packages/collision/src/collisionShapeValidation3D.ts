import type { CollisionShape3D, CollisionTestStatus } from '@flighthq/types/contract';

// Validates the flat convex-hull vertex contract.
//
// Three vertices is the floor, not four. A triangle is COPLANAR and encloses no volume, and it is
// nonetheless a shape this package is required to accept: `CollisionShapeKind3D` documents mesh
// decomposition as the route a concave mesh takes into the narrow phase, and what decomposition emits
// is individual triangles. Rejecting zero-volume hulls would ban the one input the design names.
//
// So the degenerate test is positive EXTENT rather than positive volume — the 3D reading of the 2D
// polygon's positive-area test is "not every vertex at one point", because a flat plate still has a
// well-defined support function, and the support function is the entire contract a convex hull owes.
export function getCollisionConvexValidationStatus3D(points: readonly number[]): CollisionTestStatus | null {
  if (points.length < 9 || points.length % 3 !== 0) return 'degenerate-shape';
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 'degenerate-shape';
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ) > 0 ? null : 'degenerate-shape';
}

// Returns the invalid/unsupported status that stops a 3D shape from producing a manifold, or null when
// it is usable. The 3D twin of `getCollisionShapeValidationStatus2D`, and it takes the full
// `CollisionShape3D` for the same reason: naming an unrecognized kind is the whole job.
//
// It never returns `'non-convex-polygon'`. That is not an omission — see `CollisionTestExplanation3D`:
// a 3D convex hull is reached only through a support scan that cannot select an interior vertex, so a
// concave point set is not wrong, it is simply its own convex hull.
export function getCollisionShapeValidationStatus3D(shape: Readonly<CollisionShape3D>): CollisionTestStatus | null {
  switch (shape.kind) {
    case 'sphere':
      return Number.isFinite(shape.x) &&
        Number.isFinite(shape.y) &&
        Number.isFinite(shape.z) &&
        Number.isFinite(shape.radius) &&
        shape.radius > 0
        ? null
        : 'degenerate-shape';
    case 'aabb':
      return Number.isFinite(shape.minX) &&
        Number.isFinite(shape.minY) &&
        Number.isFinite(shape.minZ) &&
        Number.isFinite(shape.maxX) &&
        Number.isFinite(shape.maxY) &&
        Number.isFinite(shape.maxZ) &&
        shape.maxX > shape.minX &&
        shape.maxY > shape.minY &&
        shape.maxZ > shape.minZ
        ? null
        : 'degenerate-shape';
    case 'box':
      // A ZERO quaternion is degenerate and a merely non-unit one is not. `CollisionBox3D` states that a
      // non-unit rotation scales the box and is the caller's error rather than something normalized on
      // every support call — so it stays a usable shape here. All-zero is different in kind: it carries
      // no orientation to scale, and rotating by it collapses the box to its centre.
      return Number.isFinite(shape.x) &&
        Number.isFinite(shape.y) &&
        Number.isFinite(shape.z) &&
        Number.isFinite(shape.halfX) &&
        Number.isFinite(shape.halfY) &&
        Number.isFinite(shape.halfZ) &&
        Number.isFinite(shape.rotationX) &&
        Number.isFinite(shape.rotationY) &&
        Number.isFinite(shape.rotationZ) &&
        Number.isFinite(shape.rotationW) &&
        shape.halfX > 0 &&
        shape.halfY > 0 &&
        shape.halfZ > 0 &&
        (shape.rotationX !== 0 || shape.rotationY !== 0 || shape.rotationZ !== 0 || shape.rotationW !== 0)
        ? null
        : 'degenerate-shape';
    case 'capsule':
      // A zero-length segment is VALID and is simply a sphere — `CollisionCapsule3D` chose the
      // segment-plus-radius form precisely so that case needs no special handling.
      return Number.isFinite(shape.x0) &&
        Number.isFinite(shape.y0) &&
        Number.isFinite(shape.z0) &&
        Number.isFinite(shape.x1) &&
        Number.isFinite(shape.y1) &&
        Number.isFinite(shape.z1) &&
        Number.isFinite(shape.radius) &&
        shape.radius > 0
        ? null
        : 'degenerate-shape';
    case 'convex':
      return getCollisionConvexValidationStatus3D(shape.points);
    default:
      return 'unsupported-shape-kind';
  }
}
