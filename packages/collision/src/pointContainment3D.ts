import type { CollisionBuiltInShape3D, CollisionConvex3D, CollisionSphere3D } from '@flighthq/types/contract';

import { testCollisionSupportOverlap3D } from './gjk3D';

// Whether the point (`x`,`y`,`z`) lies inside a 3D collider. Unknown kinds return false. The hull is
// assumed convex.
//
// The six closed-form kinds get exact, BOUNDARY-INCLUSIVE predicates and need nothing registered. A convex hull gets
// NEITHER, and cannot from what it carries: containment in a hull is a question about its FACES, and a
// bare point list has none. It is answered by GJK against a zero-radius sphere, which means a hull —
// alone among the kinds — needs `registerBuiltInCollisionSupports3D` to have been called, and treats
// its own surface as OUTSIDE rather than inside.
export function getCollisionShapeContainsPoint3D(
  shape: Readonly<CollisionBuiltInShape3D>,
  x: number,
  y: number,
  z: number,
): boolean {
  switch (shape.kind) {
    case 'sphere': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      const dz = z - shape.z;
      return dx * dx + dy * dy + dz * dz <= shape.radius * shape.radius;
    }
    case 'aabb':
      return (
        x >= shape.minX && x <= shape.maxX && y >= shape.minY && y <= shape.maxY && z >= shape.minZ && z <= shape.maxZ
      );
    case 'box': {
      // Rotate the offset into the box's own frame by the CONJUGATE of its orientation, which is the
      // inverse for a unit quaternion. Using the orientation itself rotates the wrong way and reports a
      // point on one side of a spun box as being on the other.
      const dx = x - shape.x;
      const dy = y - shape.y;
      const dz = z - shape.z;
      const qX = -shape.rotationX;
      const qY = -shape.rotationY;
      const qZ = -shape.rotationZ;
      const qW = shape.rotationW;
      const tX = 2 * (qY * dz - qZ * dy);
      const tY = 2 * (qZ * dx - qX * dz);
      const tZ = 2 * (qX * dy - qY * dx);
      const localX = dx + qW * tX + qY * tZ - qZ * tY;
      const localY = dy + qW * tY + qZ * tX - qX * tZ;
      const localZ = dz + qW * tZ + qX * tY - qY * tX;
      return Math.abs(localX) <= shape.halfX && Math.abs(localY) <= shape.halfY && Math.abs(localZ) <= shape.halfZ;
    }
    case 'capsule': {
      // A capsule is the set of points within `radius` of its segment, so containment is a
      // point-to-segment distance test — no separate cylinder and cap cases.
      const axisX = shape.x1 - shape.x0;
      const axisY = shape.y1 - shape.y0;
      const axisZ = shape.z1 - shape.z0;
      const lengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;
      let t = 0;
      if (lengthSquared > 0) {
        t = ((x - shape.x0) * axisX + (y - shape.y0) * axisY + (z - shape.z0) * axisZ) / lengthSquared;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      const dx = x - (shape.x0 + axisX * t);
      const dy = y - (shape.y0 + axisY * t);
      const dz = z - (shape.z0 + axisZ * t);
      return dx * dx + dy * dy + dz * dz <= shape.radius * shape.radius;
    }
    case 'cylinder': {
      // Two independent conditions, unlike the capsule above: BETWEEN the caps along the axis, and
      // within `radius` of the axis LINE. A capsule folds both into one distance-to-segment test because
      // its ends are round; a cylinder's flat caps make the axial bound a separate clamp-free interval
      // test, and reusing the capsule's clamped distance here would round the corners off the caps.
      const axisX = shape.x1 - shape.x0;
      const axisY = shape.y1 - shape.y0;
      const axisZ = shape.z1 - shape.z0;
      const lengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;
      if (lengthSquared <= 0) return false;
      const t = ((x - shape.x0) * axisX + (y - shape.y0) * axisY + (z - shape.z0) * axisZ) / lengthSquared;
      if (t < 0 || t > 1) return false;
      const dx = x - (shape.x0 + axisX * t);
      const dy = y - (shape.y0 + axisY * t);
      const dz = z - (shape.z0 + axisZ * t);
      return dx * dx + dy * dy + dz * dz <= shape.radius * shape.radius;
    }
    case 'cone': {
      // The permitted radius TAPERS with the axial parameter — zero at the apex, `radius` at the base —
      // which is the whole difference between a cone and a cylinder. Comparing against the full radius
      // would describe the cylinder that circumscribes it.
      const axisX = shape.baseX - shape.apexX;
      const axisY = shape.baseY - shape.apexY;
      const axisZ = shape.baseZ - shape.apexZ;
      const lengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;
      if (lengthSquared <= 0) return false;
      const t = ((x - shape.apexX) * axisX + (y - shape.apexY) * axisY + (z - shape.apexZ) * axisZ) / lengthSquared;
      if (t < 0 || t > 1) return false;
      const dx = x - (shape.apexX + axisX * t);
      const dy = y - (shape.apexY + axisY * t);
      const dz = z - (shape.apexZ + axisZ * t);
      const permitted = shape.radius * t;
      return dx * dx + dy * dy + dz * dz <= permitted * permitted;
    }
    case 'convex':
      return isPointInConvexHull3D(shape.points, x, y, z);
    default:
      return false;
  }
}

// Whether a point lies inside the convex hull of a flat `[x0,y0,z0,...]` vertex list.
//
// Answered by GJK against a ZERO-RADIUS SPHERE at the point, rather than by a predicate written here.
// A point is a convex set, so the overlap question the narrow phase already answers IS the containment
// question, and reusing the proven core beats a fifth hand-rolled piece of hull geometry.
//
// Two consequences a caller can observe, both documented on the exported function:
//   - The hull's SURFACE is exclusive, where the four closed-form kinds are inclusive, because GJK
//     treats touching as not overlapping everywhere else in this package.
//   - A hull needs `sphere` and `convex` supports registered, which the other kinds do not.
function isPointInConvexHull3D(points: number[], x: number, y: number, z: number): boolean {
  if (points.length < 3) return false;
  scratchHull.points = points;
  scratchProbe.x = x;
  scratchProbe.y = y;
  scratchProbe.z = z;
  return testCollisionSupportOverlap3D(scratchHull, scratchProbe);
}

// Reused rather than allocated: point queries run per broadphase candidate per frame in a picking loop.
// `points` is REBOUND rather than copied, so this never owns the caller's array beyond the call.
const scratchHull: CollisionConvex3D & { kind: 'convex' } = { kind: 'convex', points: [] };

const scratchProbe: CollisionSphere3D & { kind: 'sphere' } = { kind: 'sphere', x: 0, y: 0, z: 0, radius: 0 };
