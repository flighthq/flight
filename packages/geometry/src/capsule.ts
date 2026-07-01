import { createEntity } from '@flighthq/entity';
import type { BoundingSphereLike, Capsule, CapsuleLike, Ray3DLike, Vector3Like } from '@flighthq/types';

/**
 * Creates a capsule from a start point, end point, and radius. A negative radius conventionally
 * marks an empty capsule.
 */
export function createCapsule(
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radius: number,
): Capsule {
  return createEntity({ endX, endY, endZ, radius, startX, startY, startZ });
}

/**
 * Writes the point on the capsule surface (or axis) closest to `point`. Projects `point` onto
 * the capsule axis segment, clamps the parameter to [0, 1], then offsets by `radius` toward
 * `point`. When `point` lies on the axis the stable fallback is the axis point itself offset
 * along +X.
 *
 * Safe when `out` aliases `point` (reads all inputs before writing).
 */
export function getClosestPointOnCapsule(
  out: Vector3Like,
  capsule: Readonly<CapsuleLike>,
  point: Readonly<Vector3Like>,
): void {
  const ax = capsule.startX,
    ay = capsule.startY,
    az = capsule.startZ;
  const bx = capsule.endX,
    by = capsule.endY,
    bz = capsule.endZ;
  const px = point.x,
    py = point.y,
    pz = point.z;
  const r = capsule.radius;

  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const abLen2 = abx * abx + aby * aby + abz * abz;

  let closestX: number, closestY: number, closestZ: number;
  if (abLen2 < 1e-20) {
    closestX = ax;
    closestY = ay;
    closestZ = az;
  } else {
    const t = Math.min(Math.max(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLen2, 0), 1);
    closestX = ax + t * abx;
    closestY = ay + t * aby;
    closestZ = az + t * abz;
  }

  const dx = px - closestX,
    dy = py - closestY,
    dz = pz - closestZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 1e-10) {
    out.x = closestX + r;
    out.y = closestY;
    out.z = closestZ;
  } else {
    const inv = r / dist;
    out.x = closestX + dx * inv;
    out.y = closestY + dy * inv;
    out.z = closestZ + dz * inv;
  }
}

/**
 * Tests whether a ray intersects a capsule. Combines an infinite-cylinder slab test (clamped to
 * the capsule axis segment) with hemispherical cap tests at start and end.
 *
 * Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss. A ray starting inside the
 * capsule returns `t = 0`.
 */
export function intersectRay3DCapsule(ray: Readonly<Ray3DLike>, capsule: Readonly<CapsuleLike>): number {
  const ox = ray.origin.x,
    oy = ray.origin.y,
    oz = ray.origin.z;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;
  const ax = capsule.startX,
    ay = capsule.startY,
    az = capsule.startZ;
  const bx = capsule.endX,
    by = capsule.endY,
    bz = capsule.endZ;
  const r = capsule.radius;

  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const abLen2 = abx * abx + aby * aby + abz * abz;

  // Ray-sphere helper (no allocation): returns t on hit or -1 on miss.
  const sphereHit = (cx: number, cy: number, cz: number): number => {
    const mx = ox - cx,
      my = oy - cy,
      mz = oz - cz;
    const lenD2 = dx * dx + dy * dy + dz * dz;
    if (lenD2 === 0) return -1;
    const b = mx * dx + my * dy + mz * dz;
    const c = mx * mx + my * my + mz * mz - r * r;
    const disc = b * b - lenD2 * c;
    if (disc < 0) return -1;
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / lenD2;
    if (t1 >= 0) return t1;
    const t2 = (-b + sqrtD) / lenD2;
    return t2 >= 0 ? 0 : -1;
  };

  if (abLen2 < 1e-20) return sphereHit(ax, ay, az);

  let tBest = -1;

  const invAb2 = 1 / abLen2;
  const aox = ox - ax,
    aoy = oy - ay,
    aoz = oz - az;
  const dab = dx * abx + dy * aby + dz * abz;
  const aoab = aox * abx + aoy * aby + aoz * abz;

  // Perpendicular components of direction and AO relative to the capsule axis.
  const dpx = dx - dab * invAb2 * abx,
    dpy = dy - dab * invAb2 * aby,
    dpz = dz - dab * invAb2 * abz;
  const apx = aox - aoab * invAb2 * abx,
    apy = aoy - aoab * invAb2 * aby,
    apz = aoz - aoab * invAb2 * abz;

  const qa = dpx * dpx + dpy * dpy + dpz * dpz;
  const qb = apx * dpx + apy * dpy + apz * dpz;
  const qc = apx * apx + apy * apy + apz * apz - r * r;

  if (qa > 1e-20) {
    const disc = qb * qb - qa * qc;
    if (disc >= 0) {
      const sqrtD = Math.sqrt(disc);
      const t1 = (-qb - sqrtD) / qa;
      const s1 = (aoab + t1 * dab) * invAb2;
      if (t1 >= 0 && s1 >= 0 && s1 <= 1) {
        tBest = t1;
      } else if (t1 < 0) {
        const t2 = (-qb + sqrtD) / qa;
        if (t2 >= 0) {
          const s0 = aoab * invAb2;
          if (s0 >= 0 && s0 <= 1) return 0; // ray origin inside cylinder body
        }
      }
    }
  }

  const tA = sphereHit(ax, ay, az);
  if (tA >= 0 && (tBest < 0 || tA < tBest)) tBest = tA;

  const tB = sphereHit(bx, by, bz);
  if (tB >= 0 && (tBest < 0 || tB < tBest)) tBest = tB;

  return tBest;
}

/**
 * Returns whether two capsules overlap (their inflated axis-segments share any point).
 * An empty capsule (negative radius) does not intersect anything.
 */
export function isCapsuleIntersectingCapsule(a: Readonly<CapsuleLike>, b: Readonly<CapsuleLike>): boolean {
  if (a.radius < 0 || b.radius < 0) return false;
  const dist = segmentToSegmentDistanceSq(
    a.startX,
    a.startY,
    a.startZ,
    a.endX,
    a.endY,
    a.endZ,
    b.startX,
    b.startY,
    b.startZ,
    b.endX,
    b.endY,
    b.endZ,
  );
  const sumR = a.radius + b.radius;
  return dist <= sumR * sumR;
}

/**
 * Returns whether a capsule overlaps a bounding sphere. An empty capsule (negative radius) or
 * empty sphere (negative radius) does not intersect anything.
 */
export function isCapsuleIntersectingSphere(
  capsule: Readonly<CapsuleLike>,
  sphere: Readonly<BoundingSphereLike>,
): boolean {
  if (capsule.radius < 0 || sphere.radius < 0) return false;
  const dist2 = pointToSegmentDistanceSq(
    sphere.center.x,
    sphere.center.y,
    sphere.center.z,
    capsule.startX,
    capsule.startY,
    capsule.startZ,
    capsule.endX,
    capsule.endY,
    capsule.endZ,
  );
  const sumR = capsule.radius + sphere.radius;
  return dist2 <= sumR * sumR;
}

/**
 * Sets all fields of a capsule in place.
 */
export function setCapsule(
  out: CapsuleLike,
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radius: number,
): void {
  out.startX = startX;
  out.startY = startY;
  out.startZ = startZ;
  out.endX = endX;
  out.endY = endY;
  out.endZ = endZ;
  out.radius = radius;
}

// Squared distance from a point P to the line segment AB.
function pointToSegmentDistanceSq(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = Math.min(Math.max(t, 0), 1);
  const cx = ax + t * abx - px,
    cy = ay + t * aby - py,
    cz = az + t * abz - pz;
  return cx * cx + cy * cy + cz * cz;
}

// Squared distance between two line segments AB and CD (Ericson, Real-Time Collision Detection).
function segmentToSegmentDistanceSq(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const d1x = bx - ax,
    d1y = by - ay,
    d1z = bz - az;
  const d2x = dx - cx,
    d2y = dy - cy,
    d2z = dz - cz;
  const rx = ax - cx,
    ry = ay - cy,
    rz = az - cz;

  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;

  let s: number, t: number;

  if (a < 1e-20 && e < 1e-20) {
    s = 0;
    t = 0;
  } else if (a < 1e-20) {
    s = 0;
    t = Math.min(Math.max(f / e, 0), 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e < 1e-20) {
      t = 0;
      s = Math.min(Math.max(-c / a, 0), 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      if (denom > 1e-20) {
        s = Math.min(Math.max((b * f - c * e) / denom, 0), 1);
      } else {
        s = 0;
      }
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(Math.max(-c / a, 0), 1);
      } else if (t > 1) {
        t = 1;
        s = Math.min(Math.max((b - c) / a, 0), 1);
      }
    }
  }

  const qx = ax + s * d1x - (cx + t * d2x);
  const qy = ay + s * d1y - (cy + t * d2y);
  const qz = az + s * d1z - (cz + t * d2z);
  return qx * qx + qy * qy + qz * qz;
}
