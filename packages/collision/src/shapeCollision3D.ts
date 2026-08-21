import type {
  CollisionAabb3D,
  CollisionBox3D,
  CollisionCapsule3D,
  CollisionManifold3D,
  CollisionSphere3D,
} from '@flighthq/types/contract';

import { clearCollisionManifold3D } from './manifold3D';

// Closed-form 3D narrow-phase pairs, each an exact alternative to the iterative GJK/EPA floor.
//
// Most pairs here involve a CURVED boundary. EPA terminates on a distance, and distance is second-order
// insensitive to angular error, so its normal on a curved surface is accurate only to about the square
// root of its tolerance — a few parts in a thousand where the depth is good to 1e-10. A sphere's normal
// is the line between two centres and is exact in three operations, so those pairs win on conditioning
// AND on speed. The two box pairs are the throughput cases: their exact SATs avoid iterative GJK/EPA on
// the most common rigid-body primitive, including broadphase candidates that turn out not to overlap.
//
// All six take A and B in the order their name reads and write the manifold pushing **A out of B**.
// `testCollision3D` reaches the mirrored order by trying the reversed key and negating the normal, so
// registering the canonical order is enough.

// Exact for two axis-aligned boxes: overlap on all three axes, and the shallowest one is the minimum
// translation axis.
export function testAabbAabbCollision3D(
  a: Readonly<CollisionAabb3D>,
  b: Readonly<CollisionAabb3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidAabb3D(a) || !isValidAabb3D(b)) return clearAndMiss(out);

  const overlapX = Math.min(a.maxX - b.minX, b.maxX - a.minX);
  if (overlapX <= 0) return clearAndMiss(out);
  const overlapY = Math.min(a.maxY - b.minY, b.maxY - a.minY);
  if (overlapY <= 0) return clearAndMiss(out);
  const overlapZ = Math.min(a.maxZ - b.minZ, b.maxZ - a.minZ);
  if (overlapZ <= 0) return clearAndMiss(out);

  // The sign comes from which side A's centre sits on, not from which overlap term was smaller: the two
  // terms are equal when the boxes are concentric on that axis, and reading the sign off the comparison
  // would then pick a direction by floating-point accident.
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  if (overlapX <= overlapY && overlapX <= overlapZ) {
    out.normalX = a.minX + a.maxX < b.minX + b.maxX ? -1 : 1;
    out.depth = overlapX;
  } else if (overlapY <= overlapZ) {
    out.normalY = a.minY + a.maxY < b.minY + b.maxY ? -1 : 1;
    out.depth = overlapY;
  } else {
    out.normalZ = a.minZ + a.maxZ < b.minZ + b.maxZ ? -1 : 1;
    out.depth = overlapZ;
  }
  out.overlapping = true;
  return true;
}

// Exact separating-axis test for two oriented boxes. The only possible separating axes are the three
// face normals from each box plus the nine pairwise edge crosses. Every candidate is normalized before
// its interval is measured, so `depth` is a world-space distance even when an edge cross is short.
// Nearly parallel edge pairs have no usable cross and are skipped; their face axes already cover that
// limit, while normalizing their roundoff would invent an unstable direction.
export function testBoxBoxCollision3D(
  a: Readonly<CollisionBox3D>,
  b: Readonly<CollisionBox3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidBox3D(a) || !isValidBox3D(b)) return clearAndMiss(out);
  writeBoxAxes3D(a.rotationX, a.rotationY, a.rotationZ, a.rotationW, boxAxesA);
  writeBoxAxes3D(b.rotationX, b.rotationY, b.rotationZ, b.rotationW, boxAxesB);

  for (let i = 0; i < 9; i += 1) {
    boxSatAxes[i] = boxAxesA[i];
    boxSatAxes[i + 9] = boxAxesB[i];
  }
  let axisCount = 6;
  for (let axisA = 0; axisA < 3; axisA += 1) {
    const aX = boxAxesA[axisA * 3];
    const aY = boxAxesA[axisA * 3 + 1];
    const aZ = boxAxesA[axisA * 3 + 2];
    for (let axisB = 0; axisB < 3; axisB += 1) {
      const bX = boxAxesB[axisB * 3];
      const bY = boxAxesB[axisB * 3 + 1];
      const bZ = boxAxesB[axisB * 3 + 2];
      let crossX = aY * bZ - aZ * bY;
      let crossY = aZ * bX - aX * bZ;
      let crossZ = aX * bY - aY * bX;
      const lengthSquared = crossX * crossX + crossY * crossY + crossZ * crossZ;
      if (lengthSquared <= BOX_PARALLEL_AXIS_EPSILON) continue;
      const inverseLength = 1 / Math.sqrt(lengthSquared);
      crossX *= inverseLength;
      crossY *= inverseLength;
      crossZ *= inverseLength;
      boxSatAxes[axisCount * 3] = crossX;
      boxSatAxes[axisCount * 3 + 1] = crossY;
      boxSatAxes[axisCount * 3 + 2] = crossZ;
      axisCount += 1;
    }
  }

  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;
  const deltaZ = a.z - b.z;
  let bestDepth = Infinity;
  let bestNormalX = 1;
  let bestNormalY = 0;
  let bestNormalZ = 0;
  for (let axis = 0; axis < axisCount; axis += 1) {
    const axisX = boxSatAxes[axis * 3];
    const axisY = boxSatAxes[axis * 3 + 1];
    const axisZ = boxSatAxes[axis * 3 + 2];
    const radiusA =
      a.halfX * Math.abs(axisX * boxAxesA[0] + axisY * boxAxesA[1] + axisZ * boxAxesA[2]) +
      a.halfY * Math.abs(axisX * boxAxesA[3] + axisY * boxAxesA[4] + axisZ * boxAxesA[5]) +
      a.halfZ * Math.abs(axisX * boxAxesA[6] + axisY * boxAxesA[7] + axisZ * boxAxesA[8]);
    const radiusB =
      b.halfX * Math.abs(axisX * boxAxesB[0] + axisY * boxAxesB[1] + axisZ * boxAxesB[2]) +
      b.halfY * Math.abs(axisX * boxAxesB[3] + axisY * boxAxesB[4] + axisZ * boxAxesB[5]) +
      b.halfZ * Math.abs(axisX * boxAxesB[6] + axisY * boxAxesB[7] + axisZ * boxAxesB[8]);
    const centreProjection = deltaX * axisX + deltaY * axisY + deltaZ * axisZ;
    const overlap = radiusA + radiusB - Math.abs(centreProjection);
    if (overlap <= 0) return clearAndMiss(out);
    if (overlap < bestDepth) {
      const sign = centreProjection < 0 ? -1 : 1;
      bestDepth = overlap;
      bestNormalX = axisX * sign;
      bestNormalY = axisY * sign;
      bestNormalZ = axisZ * sign;
    }
  }

  out.normalX = bestNormalX === 0 ? 0 : bestNormalX;
  out.normalY = bestNormalY === 0 ? 0 : bestNormalY;
  out.normalZ = bestNormalZ === 0 ? 0 : bestNormalZ;
  out.depth = bestDepth;
  out.overlapping = true;
  return true;
}

// Exact for two capsules: the pair reduces to a sphere test at the closest points of the two segments,
// because a capsule IS the set of points within `radius` of its segment.
export function testCapsuleCapsuleCollision3D(
  a: Readonly<CollisionCapsule3D>,
  b: Readonly<CollisionCapsule3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidCapsule3D(a) || !isValidCapsule3D(b)) return clearAndMiss(out);

  writeClosestPointsBetweenSegments(
    a.x0,
    a.y0,
    a.z0,
    a.x1,
    a.y1,
    a.z1,
    b.x0,
    b.y0,
    b.z0,
    b.x1,
    b.y1,
    b.z1,
    closestPair,
  );
  return writeRadialManifold3D(
    closestPair[0] - closestPair[3],
    closestPair[1] - closestPair[4],
    closestPair[2] - closestPair[5],
    a.radius + b.radius,
    a.x1 - a.x0,
    a.y1 - a.y0,
    a.z1 - a.z0,
    out,
  );
}

// Exact for a sphere against an axis-aligned box, including the case where the centre is INSIDE the
// box — where the clamped closest point degenerates to the centre itself and carries no direction.
export function testSphereAabbCollision3D(
  a: Readonly<CollisionSphere3D>,
  b: Readonly<CollisionAabb3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidSphere3D(a) || !isValidAabb3D(b)) return clearAndMiss(out);
  return writeSphereBoxLocalManifold3D(
    a.x,
    a.y,
    a.z,
    a.radius,
    (b.minX + b.maxX) * 0.5,
    (b.minY + b.maxY) * 0.5,
    (b.minZ + b.maxZ) * 0.5,
    (b.maxX - b.minX) * 0.5,
    (b.maxY - b.minY) * 0.5,
    (b.maxZ - b.minZ) * 0.5,
    0,
    0,
    0,
    1,
    out,
  );
}

// Exact for a sphere against an oriented box. The sphere centre is carried into the box's local frame
// by the conjugate rotation, solved there as the axis-aligned case, and the resulting normal rotated
// back out — a sphere is rotationally symmetric, so nothing about it is lost in the round trip.
export function testSphereBoxCollision3D(
  a: Readonly<CollisionSphere3D>,
  b: Readonly<CollisionBox3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidSphere3D(a) || !isValidBox3D(b)) return clearAndMiss(out);
  return writeSphereBoxLocalManifold3D(
    a.x,
    a.y,
    a.z,
    a.radius,
    b.x,
    b.y,
    b.z,
    b.halfX,
    b.halfY,
    b.halfZ,
    b.rotationX,
    b.rotationY,
    b.rotationZ,
    b.rotationW,
    out,
  );
}

// Exact for a sphere against a capsule: the closest point on the capsule's segment, then a radial test.
export function testSphereCapsuleCollision3D(
  a: Readonly<CollisionSphere3D>,
  b: Readonly<CollisionCapsule3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidSphere3D(a) || !isValidCapsule3D(b)) return clearAndMiss(out);

  const axisX = b.x1 - b.x0;
  const axisY = b.y1 - b.y0;
  const axisZ = b.z1 - b.z0;
  const lengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((a.x - b.x0) * axisX + (a.y - b.y0) * axisY + (a.z - b.z0) * axisZ) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  return writeRadialManifold3D(
    a.x - (b.x0 + axisX * t),
    a.y - (b.y0 + axisY * t),
    a.z - (b.z0 + axisZ * t),
    a.radius + b.radius,
    axisX,
    axisY,
    axisZ,
    out,
  );
}

// Exact for two spheres, and the clearest case for why these pairs exist: three operations against an
// iterative solve, with a normal that is the line between the centres rather than an EPA approximation.
export function testSphereSphereCollision3D(
  a: Readonly<CollisionSphere3D>,
  b: Readonly<CollisionSphere3D>,
  out: CollisionManifold3D,
): boolean {
  if (!isValidSphere3D(a) || !isValidSphere3D(b)) return clearAndMiss(out);
  return writeRadialManifold3D(a.x - b.x, a.y - b.y, a.z - b.z, a.radius + b.radius, 0, 0, 0, out);
}

function clearAndMiss(out: CollisionManifold3D): false {
  clearCollisionManifold3D(out);
  return false;
}

function isValidAabb3D(shape: Readonly<CollisionAabb3D>): boolean {
  return (
    Number.isFinite(shape.minX) &&
    Number.isFinite(shape.minY) &&
    Number.isFinite(shape.minZ) &&
    Number.isFinite(shape.maxX) &&
    Number.isFinite(shape.maxY) &&
    Number.isFinite(shape.maxZ) &&
    shape.maxX > shape.minX &&
    shape.maxY > shape.minY &&
    shape.maxZ > shape.minZ
  );
}

function isValidBox3D(shape: Readonly<CollisionBox3D>): boolean {
  return (
    Number.isFinite(shape.x) &&
    Number.isFinite(shape.y) &&
    Number.isFinite(shape.z) &&
    Number.isFinite(shape.halfX) &&
    Number.isFinite(shape.halfY) &&
    Number.isFinite(shape.halfZ) &&
    shape.halfX > 0 &&
    shape.halfY > 0 &&
    shape.halfZ > 0 &&
    Number.isFinite(shape.rotationX) &&
    Number.isFinite(shape.rotationY) &&
    Number.isFinite(shape.rotationZ) &&
    Number.isFinite(shape.rotationW) &&
    (shape.rotationX !== 0 || shape.rotationY !== 0 || shape.rotationZ !== 0 || shape.rotationW !== 0)
  );
}

function isValidCapsule3D(shape: Readonly<CollisionCapsule3D>): boolean {
  return (
    Number.isFinite(shape.x0) &&
    Number.isFinite(shape.y0) &&
    Number.isFinite(shape.z0) &&
    Number.isFinite(shape.x1) &&
    Number.isFinite(shape.y1) &&
    Number.isFinite(shape.z1) &&
    Number.isFinite(shape.radius) &&
    shape.radius > 0
  );
}

function isValidSphere3D(shape: Readonly<CollisionSphere3D>): boolean {
  return (
    Number.isFinite(shape.x) &&
    Number.isFinite(shape.y) &&
    Number.isFinite(shape.z) &&
    Number.isFinite(shape.radius) &&
    shape.radius > 0
  );
}

// Rotates (`x`,`y`,`z`) by the quaternion, writing `[x, y, z]`. `conjugate` inverts the rotation, which
// is the world-to-local direction for a unit quaternion.
function rotateByQuaternion3D(
  x: number,
  y: number,
  z: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  conjugate: boolean,
  out: number[],
): void {
  const sx = conjugate ? -qx : qx;
  const sy = conjugate ? -qy : qy;
  const sz = conjugate ? -qz : qz;
  const tx = 2 * (sy * z - sz * y);
  const ty = 2 * (sz * x - sx * z);
  const tz = 2 * (sx * y - sy * x);
  out[0] = x + qw * tx + (sy * tz - sz * ty);
  out[1] = y + qw * ty + (sz * tx - sx * tz);
  out[2] = z + qw * tz + (sx * ty - sy * tx);
}

// Writes the three world-space columns of a unit quaternion's rotation matrix. Normalizing here keeps
// the public collision primitive's existing non-zero-quaternion contract: a scaled quaternion denotes
// the same rotation instead of turning its box axes into scaled or non-orthogonal SAT directions.
function writeBoxAxes3D(qx: number, qy: number, qz: number, qw: number, out: number[] | Float64Array): void {
  const inverseLength = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  const x = qx * inverseLength;
  const y = qy * inverseLength;
  const z = qz * inverseLength;
  const w = qw * inverseLength;
  out[0] = 1 - 2 * (y * y + z * z);
  out[1] = 2 * (x * y + w * z);
  out[2] = 2 * (x * z - w * y);
  out[3] = 2 * (x * y - w * z);
  out[4] = 1 - 2 * (x * x + z * z);
  out[5] = 2 * (y * z + w * x);
  out[6] = 2 * (x * z + w * y);
  out[7] = 2 * (y * z - w * x);
  out[8] = 1 - 2 * (x * x + y * y);
}

// The closest points on two segments, written as `[ax, ay, az, bx, by, bz]`.
//
// Minimizes the squared distance between the two parametrized points over the unit square, which is a
// quadratic with a closed-form interior solution plus the four clamped edges. The degenerate branches
// are not defensive padding: a zero-length segment is a legal capsule (it is a sphere), so `a` or `e`
// being zero is an input this is required to answer rather than an error.
function writeClosestPointsBetweenSegments(
  p1x: number,
  p1y: number,
  p1z: number,
  q1x: number,
  q1y: number,
  q1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  q2x: number,
  q2y: number,
  q2z: number,
  out: number[],
): void {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;

  const lengthSquared1 = d1x * d1x + d1y * d1y + d1z * d1z;
  const lengthSquared2 = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;

  let s = 0;
  let t = 0;
  if (lengthSquared1 <= 0 && lengthSquared2 <= 0) {
    s = 0;
    t = 0;
  } else if (lengthSquared1 <= 0) {
    t = clamp01(f / lengthSquared2);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (lengthSquared2 <= 0) {
      s = clamp01(-c / lengthSquared1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denominator = lengthSquared1 * lengthSquared2 - b * b;
      // Zero denominator means the segments are PARALLEL, where every `s` is equally close and the
      // quadratic has no unique minimum. Anchoring at s=0 picks one deterministically.
      s = denominator !== 0 ? clamp01((b * f - c * lengthSquared2) / denominator) : 0;
      t = (b * s + f) / lengthSquared2;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / lengthSquared1);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / lengthSquared1);
      }
    }
  }

  out[0] = p1x + d1x * s;
  out[1] = p1y + d1y * s;
  out[2] = p1z + d1z * s;
  out[3] = p2x + d2x * t;
  out[4] = p2y + d2y * t;
  out[5] = p2z + d2z * t;
}

// The shared tail of every sphere-like pair: a separation vector from B's closest feature to A's, and
// the radius sum that must exceed its length for an overlap.
//
// (`fallbackX`,`fallbackY`,`fallbackZ`) is an axis the degenerate direction must avoid — the capsule's
// own segment, along which pushing apart would not separate anything. Zero means no constraint.
function writeRadialManifold3D(
  deltaX: number,
  deltaY: number,
  deltaZ: number,
  radiusSum: number,
  fallbackAxisX: number,
  fallbackAxisY: number,
  fallbackAxisZ: number,
  out: CollisionManifold3D,
): boolean {
  const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
  if (distanceSquared >= radiusSum * radiusSum) return clearAndMiss(out);

  const distance = Math.sqrt(distanceSquared);
  if (distance > radiusSum * RELATIVE_EPSILON) {
    const inverse = 1 / distance;
    out.normalX = deltaX * inverse;
    out.normalY = deltaY * inverse;
    out.normalZ = deltaZ * inverse;
    out.depth = radiusSum - distance;
  } else {
    // Coincident centres carry no direction, so one is chosen. It must be PERPENDICULAR to the capsule
    // axis when there is one: two collinear capsules pushed apart along their shared axis would slide
    // rather than separate, and the solver would never resolve them.
    writePerpendicularAxis3D(fallbackAxisX, fallbackAxisY, fallbackAxisZ, perpendicular);
    out.normalX = perpendicular[0];
    out.normalY = perpendicular[1];
    out.normalZ = perpendicular[2];
    out.depth = radiusSum;
  }
  out.overlapping = true;
  return true;
}

// Some unit vector perpendicular to the given axis, or (1,0,0) when the axis is zero.
//
// Crossing with whichever cardinal axis the input leans on LEAST keeps the cross product well away from
// zero; crossing with a fixed axis would collapse whenever the input happened to be parallel to it.
function writePerpendicularAxis3D(x: number, y: number, z: number, out: number[]): void {
  if (x === 0 && y === 0 && z === 0) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absZ = Math.abs(z);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  if (absX <= absY && absX <= absZ) cx = 1;
  else if (absY <= absZ) cy = 1;
  else cz = 1;

  const px = y * cz - z * cy;
  const py = z * cx - x * cz;
  const pz = x * cy - y * cx;
  const length = Math.sqrt(px * px + py * py + pz * pz);
  if (length > 0) {
    out[0] = px / length;
    out[1] = py / length;
    out[2] = pz / length;
    return;
  }
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
}

// The sphere-versus-box core, in the box's local frame, shared by the axis-aligned and oriented pairs.
// A zero rotation makes the two transforms identities, so the aabb case pays nothing for the sharing.
function writeSphereBoxLocalManifold3D(
  sphereX: number,
  sphereY: number,
  sphereZ: number,
  radius: number,
  boxX: number,
  boxY: number,
  boxZ: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  out: CollisionManifold3D,
): boolean {
  rotateByQuaternion3D(sphereX - boxX, sphereY - boxY, sphereZ - boxZ, qx, qy, qz, qw, true, localCentre);
  const lx = localCentre[0];
  const ly = localCentre[1];
  const lz = localCentre[2];

  const clampedX = lx < -halfX ? -halfX : lx > halfX ? halfX : lx;
  const clampedY = ly < -halfY ? -halfY : ly > halfY ? halfY : ly;
  const clampedZ = lz < -halfZ ? -halfZ : lz > halfZ ? halfZ : lz;
  const deltaX = lx - clampedX;
  const deltaY = ly - clampedY;
  const deltaZ = lz - clampedZ;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;

  let localNormalX: number;
  let localNormalY: number;
  let localNormalZ: number;
  let depth: number;
  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    if (distance >= radius) return clearAndMiss(out);
    const inverse = 1 / distance;
    localNormalX = deltaX * inverse;
    localNormalY = deltaY * inverse;
    localNormalZ = deltaZ * inverse;
    depth = radius - distance;
  } else {
    // The centre is INSIDE the box, where the clamped point is the centre itself and the separation
    // vector is zero. The escape is the nearest FACE, and the depth is how far the centre must travel to
    // reach it plus the whole radius beyond.
    const exitX = halfX - Math.abs(lx);
    const exitY = halfY - Math.abs(ly);
    const exitZ = halfZ - Math.abs(lz);
    localNormalX = 0;
    localNormalY = 0;
    localNormalZ = 0;
    if (exitX <= exitY && exitX <= exitZ) {
      localNormalX = lx < 0 ? -1 : 1;
      depth = radius + exitX;
    } else if (exitY <= exitZ) {
      localNormalY = ly < 0 ? -1 : 1;
      depth = radius + exitY;
    } else {
      localNormalZ = lz < 0 ? -1 : 1;
      depth = radius + exitZ;
    }
  }

  rotateByQuaternion3D(localNormalX, localNormalY, localNormalZ, qx, qy, qz, qw, false, localCentre);
  out.normalX = localCentre[0];
  out.normalY = localCentre[1];
  out.normalZ = localCentre[2];
  out.depth = depth;
  out.overlapping = true;
  return true;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const RELATIVE_EPSILON = 1e-12;
const BOX_PARALLEL_AXIS_EPSILON = 1e-12;
const boxAxesA = new Float64Array(9);
const boxAxesB = new Float64Array(9);
const boxSatAxes = new Float64Array(45);
const closestPair = [0, 0, 0, 0, 0, 0];
const localCentre = [0, 0, 0];
const perpendicular = [0, 0, 0];
