import { createEntity } from '@flighthq/entity/contract';
import type { AabbLike, Matrix4Like, Obb, ObbLike, Ray3DLike, Vector3Like } from '@flighthq/types/contract';

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

  const qx = obb.orientationX,
    qy = obb.orientationY,
    qz = obb.orientationZ,
    qw = obb.orientationW;
  const xx = qx * qx,
    yy = qy * qy,
    zz = qz * qz,
    xy = qx * qy,
    xz = qx * qz,
    yz = qy * qz,
    wx = qw * qx,
    wy = qw * qy,
    wz = qw * qz;
  const ax0 = 1 - 2 * (yy + zz),
    ay0 = 2 * (xy + wz),
    az0 = 2 * (xz - wy),
    ax1 = 2 * (xy - wz),
    ay1 = 1 - 2 * (xx + zz),
    az1 = 2 * (yz + wx),
    ax2 = 2 * (xz + wy),
    ay2 = 2 * (yz - wx),
    az2 = 1 - 2 * (xx + yy);

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
 * OBB returns `t = 0`. Direction need not be normalized. A direction of zero length is not a
 * ray and always returns `-1`.
 */
export function intersectRay3DObb(ray: Readonly<Ray3DLike>, obb: Readonly<ObbLike>): number {
  const ox = ray.origin.x - obb.centerX,
    oy = ray.origin.y - obb.centerY,
    oz = ray.origin.z - obb.centerZ;
  const dx = ray.direction.x,
    dy = ray.direction.y,
    dz = ray.direction.z;

  if (dx * dx + dy * dy + dz * dz === 0) return -1; // zero-length direction

  const hx = obb.halfExtentX,
    hy = obb.halfExtentY,
    hz = obb.halfExtentZ;

  const qx = obb.orientationX,
    qy = obb.orientationY,
    qz = obb.orientationZ,
    qw = obb.orientationW;
  const xx = qx * qx,
    yy = qy * qy,
    zz = qz * qz,
    xy = qx * qy,
    xz = qx * qz,
    yz = qy * qz,
    wx = qw * qx,
    wy = qw * qy,
    wz = qw * qz;
  const ax0 = 1 - 2 * (yy + zz),
    ay0 = 2 * (xy + wz),
    az0 = 2 * (xz - wy),
    ax1 = 2 * (xy - wz),
    ay1 = 1 - 2 * (xx + zz),
    az1 = 2 * (yz + wx),
    ax2 = 2 * (xz + wy),
    ay2 = 2 * (yz - wx),
    az2 = 1 - 2 * (xx + yy);

  const origin0 = ox * ax0 + oy * ay0 + oz * az0,
    origin1 = ox * ax1 + oy * ay1 + oz * az1,
    origin2 = ox * ax2 + oy * ay2 + oz * az2;
  const direction0 = dx * ax0 + dy * ay0 + dz * az0,
    direction1 = dx * ax1 + dy * ay1 + dz * az1,
    direction2 = dx * ax2 + dy * ay2 + dz * az2;

  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;

  if (direction0 !== 0) {
    const invD = 1 / direction0;
    let t1 = (-hx - origin0) * invD;
    let t2 = (hx - origin0) * invD;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (origin0 < -hx || origin0 > hx) {
    return -1;
  }

  if (direction1 !== 0) {
    const invD = 1 / direction1;
    let t1 = (-hy - origin1) * invD;
    let t2 = (hy - origin1) * invD;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (origin1 < -hy || origin1 > hy) {
    return -1;
  }

  if (direction2 !== 0) {
    const invD = 1 / direction2;
    let t1 = (-hz - origin2) * invD;
    let t2 = (hz - origin2) * invD;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  } else if (origin2 < -hz || origin2 > hz) {
    return -1;
  }

  return tMin;
}

/**
 * Returns whether an oriented bounding box overlaps an axis-aligned bounding box using the
 * Separating Axis Theorem with 15 candidate axes. An empty AABB (min > max on any axis) does
 * not intersect the OBB.
 */
export function isObbIntersectingAabb(obb: Readonly<ObbLike>, aabb: Readonly<AabbLike>): boolean {
  if (aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z) return false;

  const acx = (aabb.min.x + aabb.max.x) * 0.5,
    acy = (aabb.min.y + aabb.max.y) * 0.5,
    acz = (aabb.min.z + aabb.max.z) * 0.5;
  const ahx = (aabb.max.x - aabb.min.x) * 0.5,
    ahy = (aabb.max.y - aabb.min.y) * 0.5,
    ahz = (aabb.max.z - aabb.min.z) * 0.5;

  const qx = obb.orientationX,
    qy = obb.orientationY,
    qz = obb.orientationZ,
    qw = obb.orientationW;
  const xx = qx * qx,
    yy = qy * qy,
    zz = qz * qz,
    xy = qx * qy,
    xz = qx * qz,
    yz = qy * qz,
    wx = qw * qx,
    wy = qw * qy,
    wz = qw * qz;
  const ax0 = 1 - 2 * (yy + zz),
    ay0 = 2 * (xy + wz),
    az0 = 2 * (xz - wy),
    ax1 = 2 * (xy - wz),
    ay1 = 1 - 2 * (xx + zz),
    az1 = 2 * (yz + wx),
    ax2 = 2 * (xz + wy),
    ay2 = 2 * (yz - wx),
    az2 = 1 - 2 * (xx + yy);

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
  const aqx = a.orientationX,
    aqy = a.orientationY,
    aqz = a.orientationZ,
    aqw = a.orientationW;
  const axx = aqx * aqx,
    ayy = aqy * aqy,
    azz = aqz * aqz,
    axy = aqx * aqy,
    axz = aqx * aqz,
    ayz = aqy * aqz,
    awx = aqw * aqx,
    awy = aqw * aqy,
    awz = aqw * aqz;
  const ax0 = 1 - 2 * (ayy + azz),
    ay0 = 2 * (axy + awz),
    az0 = 2 * (axz - awy),
    ax1 = 2 * (axy - awz),
    ay1 = 1 - 2 * (axx + azz),
    az1 = 2 * (ayz + awx),
    ax2 = 2 * (axz + awy),
    ay2 = 2 * (ayz - awx),
    az2 = 1 - 2 * (axx + ayy);

  const bqx = b.orientationX,
    bqy = b.orientationY,
    bqz = b.orientationZ,
    bqw = b.orientationW;
  const bxx = bqx * bqx,
    byy = bqy * bqy,
    bzz = bqz * bqz,
    bxy = bqx * bqy,
    bxz = bqx * bqz,
    byz = bqy * bqz,
    bwx = bqw * bqx,
    bwy = bqw * bqy,
    bwz = bqw * bqz;
  const bx0 = 1 - 2 * (byy + bzz),
    by0 = 2 * (bxy + bwz),
    bz0 = 2 * (bxz - bwy),
    bx1 = 2 * (bxy - bwz),
    by1 = 1 - 2 * (bxx + bzz),
    bz1 = 2 * (byz + bwx),
    bx2 = 2 * (bxz + bwy),
    by2 = 2 * (byz - bwx),
    bz2 = 1 - 2 * (bxx + byy);

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

  // Quaternion from rotation matrix (Shepperd method). The antisymmetric pairs follow the same
  // handedness as the local-axis rotation map, whose inverse uses x = (r21 - r12), not (r12 - r21).
  // Flipping either one silently yields the conjugate — a rotation by -angle about the same axis.
  let mqw: number, mqx: number, mqy: number, mqz: number;
  const trace = r00 + r11 + r22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    mqw = 0.25 / s;
    mqx = (r21 - r12) * s;
    mqy = (r02 - r20) * s;
    mqz = (r10 - r01) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2 * Math.sqrt(1 + r00 - r11 - r22);
    mqw = (r21 - r12) / s;
    mqx = 0.25 * s;
    mqy = (r10 + r01) / s;
    mqz = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = 2 * Math.sqrt(1 + r11 - r00 - r22);
    mqw = (r02 - r20) / s;
    mqx = (r10 + r01) / s;
    mqy = 0.25 * s;
    mqz = (r21 + r12) / s;
  } else {
    const s = 2 * Math.sqrt(1 + r22 - r00 - r11);
    mqw = (r10 - r01) / s;
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
  for (let axis = 0; axis < 15; axis++) {
    let lx: number, ly: number, lz: number;
    switch (axis) {
      case 0:
        lx = ax0;
        ly = ay0;
        lz = az0;
        break;
      case 1:
        lx = ax1;
        ly = ay1;
        lz = az1;
        break;
      case 2:
        lx = ax2;
        ly = ay2;
        lz = az2;
        break;
      case 3:
        lx = bx0;
        ly = by0;
        lz = bz0;
        break;
      case 4:
        lx = bx1;
        ly = by1;
        lz = bz1;
        break;
      case 5:
        lx = bx2;
        ly = by2;
        lz = bz2;
        break;
      case 6:
        lx = ay0 * bz0 - az0 * by0;
        ly = az0 * bx0 - ax0 * bz0;
        lz = ax0 * by0 - ay0 * bx0;
        break;
      case 7:
        lx = ay0 * bz1 - az0 * by1;
        ly = az0 * bx1 - ax0 * bz1;
        lz = ax0 * by1 - ay0 * bx1;
        break;
      case 8:
        lx = ay0 * bz2 - az0 * by2;
        ly = az0 * bx2 - ax0 * bz2;
        lz = ax0 * by2 - ay0 * bx2;
        break;
      case 9:
        lx = ay1 * bz0 - az1 * by0;
        ly = az1 * bx0 - ax1 * bz0;
        lz = ax1 * by0 - ay1 * bx0;
        break;
      case 10:
        lx = ay1 * bz1 - az1 * by1;
        ly = az1 * bx1 - ax1 * bz1;
        lz = ax1 * by1 - ay1 * bx1;
        break;
      case 11:
        lx = ay1 * bz2 - az1 * by2;
        ly = az1 * bx2 - ax1 * bz2;
        lz = ax1 * by2 - ay1 * bx2;
        break;
      case 12:
        lx = ay2 * bz0 - az2 * by0;
        ly = az2 * bx0 - ax2 * bz0;
        lz = ax2 * by0 - ay2 * bx0;
        break;
      case 13:
        lx = ay2 * bz1 - az2 * by1;
        ly = az2 * bx1 - ax2 * bz1;
        lz = ax2 * by1 - ay2 * bx1;
        break;
      default:
        lx = ay2 * bz2 - az2 * by2;
        ly = az2 * bx2 - ax2 * bz2;
        lz = ax2 * by2 - ay2 * bx2;
        break;
    }

    const lenSq = lx * lx + ly * ly + lz * lz;
    if (lenSq < 1e-10) continue;
    const d = Math.abs(tx * lx + ty * ly + tz * lz);
    const pA =
      Math.abs(ax0 * lx + ay0 * ly + az0 * lz) * hax +
      Math.abs(ax1 * lx + ay1 * ly + az1 * lz) * hay +
      Math.abs(ax2 * lx + ay2 * ly + az2 * lz) * haz;
    const pB =
      Math.abs(bx0 * lx + by0 * ly + bz0 * lz) * hbx +
      Math.abs(bx1 * lx + by1 * ly + bz1 * lz) * hby +
      Math.abs(bx2 * lx + by2 * ly + bz2 * lz) * hbz;
    if (d > pA + pB) return true;
  }
  return false;
}
