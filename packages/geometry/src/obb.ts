import { createEntity } from '@flighthq/entity';
import type { AabbLike, Matrix4Like, Obb, ObbLike, Ray3DLike, Vector3Like } from '@flighthq/types';

/**
 * Creates an oriented bounding box from a center, half-extents, and an orientation quaternion
 * (x, y, z, w). The identity orientation (0, 0, 0, 1) aligns local axes with world axes.
 */
export function createObb(
  centerX: number,
  centerY: number,
  centerZ: number,
  halfExtentX: number,
  halfExtentY: number,
  halfExtentZ: number,
  orientationX: number,
  orientationY: number,
  orientationZ: number,
  orientationW: number,
): Obb {
  return createEntity({
    centerX,
    centerY,
    centerZ,
    halfExtentX,
    halfExtentY,
    halfExtentZ,
    orientationW,
    orientationX,
    orientationY,
    orientationZ,
  });
}

/**
 * Writes the point on (or inside) an oriented bounding box closest to `point`. Each axis
 * independently clamps the point's projection onto that axis to the half-extent range.
 *
 * Safe when `out` aliases `point` (reads all inputs before writing).
 */
export function getClosestPointOnObb(out: Vector3Like, obb: Readonly<ObbLike>, point: Readonly<Vector3Like>): void {
  const cx = obb.centerX,
    cy = obb.centerY,
    cz = obb.centerZ;
  const hx = obb.halfExtentX,
    hy = obb.halfExtentY,
    hz = obb.halfExtentZ;
  const px = point.x,
    py = point.y,
    pz = point.z;

  const [ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2] = obbLocalAxes(obb);

  const dx = px - cx,
    dy = py - cy,
    dz = pz - cz;

  const d0 = Math.min(Math.max(dx * ax0 + dy * ay0 + dz * az0, -hx), hx);
  const d1 = Math.min(Math.max(dx * ax1 + dy * ay1 + dz * az1, -hy), hy);
  const d2 = Math.min(Math.max(dx * ax2 + dy * ay2 + dz * az2, -hz), hz);

  out.x = cx + d0 * ax0 + d1 * ax1 + d2 * ax2;
  out.y = cy + d0 * ay0 + d1 * ay1 + d2 * ay2;
  out.z = cz + d0 * az0 + d1 * az1 + d2 * az2;
}

/**
 * Tests whether a ray intersects an oriented bounding box. Transforms the ray into OBB local
 * space, then applies the slab method against the axis-aligned half-extent box.
 *
 * Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss. A ray starting inside the
 * OBB returns `t = 0`.
 */
export function intersectRay3DObb(ray: Readonly<Ray3DLike>, obb: Readonly<ObbLike>): number {
  const ox = ray.origin.x - obb.centerX,
    oy = ray.origin.y - obb.centerY,
    oz = ray.origin.z - obb.centerZ;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;
  const hx = obb.halfExtentX,
    hy = obb.halfExtentY,
    hz = obb.halfExtentZ;

  const [ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2] = obbLocalAxes(obb);

  const origins = [ox * ax0 + oy * ay0 + oz * az0, ox * ax1 + oy * ay1 + oz * az1, ox * ax2 + oy * ay2 + oz * az2];
  const dirs = [dx * ax0 + dy * ay0 + dz * az0, dx * ax1 + dy * ay1 + dz * az1, dx * ax2 + dy * ay2 + dz * az2];
  const halfExts = [hx, hy, hz];

  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 3; i++) {
    const o = origins[i];
    const d = dirs[i];
    const h = halfExts[i];
    if (Math.abs(d) > 1e-10) {
      const invD = 1 / d;
      let t1 = (-h - o) * invD;
      let t2 = (h - o) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return -1;
    } else if (o < -h || o > h) {
      return -1;
    }
  }

  return tMin;
}

/**
 * Returns whether an oriented bounding box overlaps an axis-aligned bounding box using the
 * Separating Axis Theorem with 15 candidate axes.
 */
export function isObbIntersectingAabb(obb: Readonly<ObbLike>, aabb: Readonly<AabbLike>): boolean {
  const acx = (aabb.min.x + aabb.max.x) * 0.5,
    acy = (aabb.min.y + aabb.max.y) * 0.5,
    acz = (aabb.min.z + aabb.max.z) * 0.5;
  const ahx = (aabb.max.x - aabb.min.x) * 0.5,
    ahy = (aabb.max.y - aabb.min.y) * 0.5,
    ahz = (aabb.max.z - aabb.min.z) * 0.5;

  const [ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2] = obbLocalAxes(obb);

  const tx = acx - obb.centerX,
    ty = acy - obb.centerY,
    tz = acz - obb.centerZ;

  return !obbSatSeparated(
    tx,
    ty,
    tz,
    ax0,
    ay0,
    az0,
    ax1,
    ay1,
    az1,
    ax2,
    ay2,
    az2,
    obb.halfExtentX,
    obb.halfExtentY,
    obb.halfExtentZ,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    ahx,
    ahy,
    ahz,
  );
}

/**
 * Returns whether two oriented bounding boxes overlap using the Separating Axis Theorem with
 * 15 candidate axes (3 face normals per box plus 9 edge cross-products).
 */
export function isObbIntersectingObb(a: Readonly<ObbLike>, b: Readonly<ObbLike>): boolean {
  const [ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2] = obbLocalAxes(a);
  const [bx0, by0, bz0, bx1, by1, bz1, bx2, by2, bz2] = obbLocalAxes(b);

  const tx = b.centerX - a.centerX,
    ty = b.centerY - a.centerY,
    tz = b.centerZ - a.centerZ;

  return !obbSatSeparated(
    tx,
    ty,
    tz,
    ax0,
    ay0,
    az0,
    ax1,
    ay1,
    az1,
    ax2,
    ay2,
    az2,
    a.halfExtentX,
    a.halfExtentY,
    a.halfExtentZ,
    bx0,
    by0,
    bz0,
    bx1,
    by1,
    bz1,
    bx2,
    by2,
    bz2,
    b.halfExtentX,
    b.halfExtentY,
    b.halfExtentZ,
  );
}

/**
 * Sets all fields of an oriented bounding box in place.
 */
export function setObb(
  out: ObbLike,
  centerX: number,
  centerY: number,
  centerZ: number,
  halfExtentX: number,
  halfExtentY: number,
  halfExtentZ: number,
  orientationX: number,
  orientationY: number,
  orientationZ: number,
  orientationW: number,
): void {
  out.centerX = centerX;
  out.centerY = centerY;
  out.centerZ = centerZ;
  out.halfExtentX = halfExtentX;
  out.halfExtentY = halfExtentY;
  out.halfExtentZ = halfExtentZ;
  out.orientationX = orientationX;
  out.orientationY = orientationY;
  out.orientationZ = orientationZ;
  out.orientationW = orientationW;
}

/**
 * Transforms an oriented bounding box by a Matrix4. The center is transformed as a point;
 * the orientation is composed with the matrix's rotation; the half-extents are scaled by the
 * column magnitudes of the matrix's linear part.
 *
 * Reads all of `obb` into locals before writing, so it is safe when `out` aliases `obb`.
 */
export function transformObbByMatrix4(out: ObbLike, obb: Readonly<ObbLike>, m: Readonly<Matrix4Like>): void {
  const cx = obb.centerX,
    cy = obb.centerY,
    cz = obb.centerZ;
  const hx = obb.halfExtentX,
    hy = obb.halfExtentY,
    hz = obb.halfExtentZ;
  const oqx = obb.orientationX,
    oqy = obb.orientationY,
    oqz = obb.orientationZ,
    oqw = obb.orientationW;

  const _m = m.m;
  const newCx = _m[0] * cx + _m[4] * cy + _m[8] * cz + _m[12];
  const newCy = _m[1] * cx + _m[5] * cy + _m[9] * cz + _m[13];
  const newCz = _m[2] * cx + _m[6] * cy + _m[10] * cz + _m[14];

  const sx = Math.sqrt(_m[0] * _m[0] + _m[1] * _m[1] + _m[2] * _m[2]);
  const sy = Math.sqrt(_m[4] * _m[4] + _m[5] * _m[5] + _m[6] * _m[6]);
  const sz = Math.sqrt(_m[8] * _m[8] + _m[9] * _m[9] + _m[10] * _m[10]);

  // Normalized rotation matrix from matrix columns.
  const r00 = sx > 0 ? _m[0] / sx : 1,
    r10 = sx > 0 ? _m[1] / sx : 0,
    r20 = sx > 0 ? _m[2] / sx : 0;
  const r01 = sy > 0 ? _m[4] / sy : 0,
    r11 = sy > 0 ? _m[5] / sy : 1,
    r21 = sy > 0 ? _m[6] / sy : 0;
  const r02 = sz > 0 ? _m[8] / sz : 0,
    r12 = sz > 0 ? _m[9] / sz : 0,
    r22 = sz > 0 ? _m[10] / sz : 1;

  // Quaternion from rotation matrix (Shepperd method).
  let mqw: number, mqx: number, mqy: number, mqz: number;
  const trace = r00 + r11 + r22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    mqw = 0.25 / s;
    mqx = (r12 - r21) * s;
    mqy = (r20 - r02) * s;
    mqz = (r01 - r10) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    mqw = (r12 - r21) / s;
    mqx = 0.25 * s;
    mqy = (r10 + r01) / s;
    mqz = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    mqw = (r20 - r02) / s;
    mqx = (r10 + r01) / s;
    mqy = 0.25 * s;
    mqz = (r21 + r12) / s;
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    mqw = (r01 - r10) / s;
    mqx = (r20 + r02) / s;
    mqy = (r21 + r12) / s;
    mqz = 0.25 * s;
  }

  // Compose: new orientation = mq * obb.orientation (Hamilton product)
  out.centerX = newCx;
  out.centerY = newCy;
  out.centerZ = newCz;
  out.halfExtentX = hx * sx;
  out.halfExtentY = hy * sy;
  out.halfExtentZ = hz * sz;
  out.orientationX = mqw * oqx + mqx * oqw + mqy * oqz - mqz * oqy;
  out.orientationY = mqw * oqy - mqx * oqz + mqy * oqw + mqz * oqx;
  out.orientationZ = mqw * oqz + mqx * oqy - mqy * oqx + mqz * oqw;
  out.orientationW = mqw * oqw - mqx * oqx - mqy * oqy - mqz * oqz;
}

// Returns [axisX.x, axisX.y, axisX.z, axisY.x, axisY.y, axisY.z, axisZ.x, axisZ.y, axisZ.z]
// where each triple is an OBB local axis expressed in world space (column of the rotation matrix).
function obbLocalAxes(
  obb: Readonly<ObbLike>,
): [number, number, number, number, number, number, number, number, number] {
  const qx = obb.orientationX,
    qy = obb.orientationY,
    qz = obb.orientationZ,
    qw = obb.orientationW;
  const xx = qx * qx,
    yy = qy * qy,
    zz = qz * qz;
  const xy = qx * qy,
    xz = qx * qz,
    yz = qy * qz;
  const wx = qw * qx,
    wy = qw * qy,
    wz = qw * qz;
  return [
    1 - 2 * (yy + zz),
    2 * (xy + wz),
    2 * (xz - wy),
    2 * (xy - wz),
    1 - 2 * (xx + zz),
    2 * (yz + wx),
    2 * (xz + wy),
    2 * (yz - wx),
    1 - 2 * (xx + yy),
  ];
}

// Returns true if the two OBBs (given by their center offset, local axes, and half-extents) are
// separated on any of the 15 SAT candidate axes. True = separated = no intersection.
function obbSatSeparated(
  tx: number,
  ty: number,
  tz: number,
  ax0: number,
  ay0: number,
  az0: number,
  ax1: number,
  ay1: number,
  az1: number,
  ax2: number,
  ay2: number,
  az2: number,
  hax: number,
  hay: number,
  haz: number,
  bx0: number,
  by0: number,
  bz0: number,
  bx1: number,
  by1: number,
  bz1: number,
  bx2: number,
  by2: number,
  bz2: number,
  hbx: number,
  hby: number,
  hbz: number,
): boolean {
  const onAxis = (lx: number, ly: number, lz: number): boolean => {
    const lenSq = lx * lx + ly * ly + lz * lz;
    if (lenSq < 1e-10) return false;
    const d = Math.abs(tx * lx + ty * ly + tz * lz);
    const pA =
      Math.abs(ax0 * lx + ay0 * ly + az0 * lz) * hax +
      Math.abs(ax1 * lx + ay1 * ly + az1 * lz) * hay +
      Math.abs(ax2 * lx + ay2 * ly + az2 * lz) * haz;
    const pB =
      Math.abs(bx0 * lx + by0 * ly + bz0 * lz) * hbx +
      Math.abs(bx1 * lx + by1 * ly + bz1 * lz) * hby +
      Math.abs(bx2 * lx + by2 * ly + bz2 * lz) * hbz;
    return d > pA + pB;
  };

  if (onAxis(ax0, ay0, az0)) return true;
  if (onAxis(ax1, ay1, az1)) return true;
  if (onAxis(ax2, ay2, az2)) return true;
  if (onAxis(bx0, by0, bz0)) return true;
  if (onAxis(bx1, by1, bz1)) return true;
  if (onAxis(bx2, by2, bz2)) return true;
  if (onAxis(ay0 * bz0 - az0 * by0, az0 * bx0 - ax0 * bz0, ax0 * by0 - ay0 * bx0)) return true;
  if (onAxis(ay0 * bz1 - az0 * by1, az0 * bx1 - ax0 * bz1, ax0 * by1 - ay0 * bx1)) return true;
  if (onAxis(ay0 * bz2 - az0 * by2, az0 * bx2 - ax0 * bz2, ax0 * by2 - ay0 * bx2)) return true;
  if (onAxis(ay1 * bz0 - az1 * by0, az1 * bx0 - ax1 * bz0, ax1 * by0 - ay1 * bx0)) return true;
  if (onAxis(ay1 * bz1 - az1 * by1, az1 * bx1 - ax1 * bz1, ax1 * by1 - ay1 * bx1)) return true;
  if (onAxis(ay1 * bz2 - az1 * by2, az1 * bx2 - ax1 * bz2, ax1 * by2 - ay1 * bx2)) return true;
  if (onAxis(ay2 * bz0 - az2 * by0, az2 * bx0 - ax2 * bz0, ax2 * by0 - ay2 * bx0)) return true;
  if (onAxis(ay2 * bz1 - az2 * by1, az2 * bx1 - ax2 * bz1, ax2 * by1 - ay2 * bx1)) return true;
  if (onAxis(ay2 * bz2 - az2 * by2, az2 * bx2 - ax2 * bz2, ax2 * by2 - ay2 * bx2)) return true;
  return false;
}
