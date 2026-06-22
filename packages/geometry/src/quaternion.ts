import { createEntity } from '@flighthq/entity';
import type { Matrix4Like, Quaternion, QuaternionLike, Vector3Like } from '@flighthq/types';

export function cloneQuaternion(source: Readonly<QuaternionLike>): Quaternion {
  return createQuaternion(source.x, source.y, source.z, source.w);
}

/**
 * Writes the conjugate of a quaternion, negating the vector part (x, y, z) and
 * leaving the scalar part (w) unchanged. For a unit quaternion the conjugate is
 * also its inverse.
 *
 * Safe when `out` aliases `source`.
 */
export function conjugateQuaternion(out: QuaternionLike, source: Readonly<QuaternionLike>): void {
  out.x = -source.x;
  out.y = -source.y;
  out.z = -source.z;
  out.w = source.w;
}

/**
 * Copies the x, y, z and w components of a quaternion.
 *
 * Safe when `out` aliases `source`.
 */
export function copyQuaternion(out: QuaternionLike, source: Readonly<QuaternionLike>): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
  out.w = source.w;
}

/**
 * Creates a unit quaternion (x, y, z, w) representing a 3D rotation. Handedness is pinned
 * across the 3D suite: right-handed coordinates, CCW front-face, glTF tangent w-sign.
 *
 * Defaults to the identity rotation (0, 0, 0, 1).
 */
export function createQuaternion(x?: number, y?: number, z?: number, w?: number): Quaternion {
  return createEntity({ x: x ?? 0, y: y ?? 0, z: z ?? 0, w: w ?? 1 });
}

export function equalsQuaternion(
  a: Readonly<QuaternionLike> | null | undefined,
  b: Readonly<QuaternionLike> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
}

/**
 * Hamilton product of two quaternions: out = a · b. The result represents applying
 * rotation `b` first, then rotation `a`.
 *
 * Safe when `out` aliases `a` and/or `b` (all inputs are read into locals first).
 */
export function multiplyQuaternion(
  out: QuaternionLike,
  a: Readonly<QuaternionLike>,
  b: Readonly<QuaternionLike>,
): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;

  out.x = aw * bx + ax * bw + ay * bz - az * by;
  out.y = aw * by - ax * bz + ay * bw + az * bx;
  out.z = aw * bz + ax * by - ay * bx + az * bw;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
}

/**
 * Normalizes a quaternion to unit length. A zero-length quaternion is written as the
 * identity rotation (0, 0, 0, 1).
 *
 * Returns the original length. Safe when `out` aliases `source`.
 */
export function normalizeQuaternion(out: QuaternionLike, source: Readonly<QuaternionLike>): number {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  const l = Math.sqrt(x * x + y * y + z * z + w * w);

  if (l !== 0) {
    const inv = 1 / l;
    out.x = x * inv;
    out.y = y * inv;
    out.z = z * inv;
    out.w = w * inv;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 1;
  }

  return l;
}

/**
 * Builds a quaternion from a rotation `axis` (assumed unit length) and an `angle` in
 * radians. The rotation is right-handed (CCW when looking down the axis toward the origin).
 *
 * Safe when `out` aliases `axis`.
 */
export function setQuaternionFromAxisAngle(out: QuaternionLike, axis: Readonly<Vector3Like>, angle: number): void {
  const half = angle * 0.5;
  const s = Math.sin(half);
  out.x = axis.x * s;
  out.y = axis.y * s;
  out.z = axis.z * s;
  out.w = Math.cos(half);
}

/**
 * Extracts the rotation of a Matrix4 (upper-left 3×3, assumed orthonormal) into a unit
 * quaternion. Uses the numerically stable trace/largest-diagonal branch.
 */
export function setQuaternionFromMatrix4(out: QuaternionLike, source: Readonly<Matrix4Like>): void {
  const m = source.m;
  // Column-major Matrix4: m[col*4 + row]. Upper-left 3×3 rotation basis.
  const m00 = m[0],
    m10 = m[4],
    m20 = m[8],
    m01 = m[1],
    m11 = m[5],
    m21 = m[9],
    m02 = m[2],
    m12 = m[6],
    m22 = m[10];

  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    out.w = 0.25 / s;
    out.x = (m12 - m21) * s;
    out.y = (m20 - m02) * s;
    out.z = (m01 - m10) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    out.w = (m12 - m21) / s;
    out.x = 0.25 * s;
    out.y = (m10 + m01) / s;
    out.z = (m20 + m02) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    out.w = (m20 - m02) / s;
    out.x = (m10 + m01) / s;
    out.y = 0.25 * s;
    out.z = (m21 + m12) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    out.w = (m01 - m10) / s;
    out.x = (m20 + m02) / s;
    out.y = (m21 + m12) / s;
    out.z = 0.25 * s;
  }
}

/**
 * Resets a quaternion to the identity rotation (0, 0, 0, 1).
 */
export function setQuaternionIdentity(out: QuaternionLike): void {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.w = 1;
}

/**
 * Spherical linear interpolation between two unit quaternions at parameter `t` in [0, 1].
 * Chooses the shorter arc (negating `b` if the dot product is negative) and falls back to
 * normalized linear interpolation when the inputs are nearly collinear.
 *
 * Safe when `out` aliases `a` and/or `b` (all inputs are read into locals first).
 */
export function slerpQuaternion(
  out: QuaternionLike,
  a: Readonly<QuaternionLike>,
  b: Readonly<QuaternionLike>,
  t: number,
): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  let bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;

  let cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw;

  // Take the shorter arc.
  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let scaleA: number;
  let scaleB: number;

  if (cosHalfTheta < 0.999999) {
    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sin(halfTheta);
    scaleA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    scaleB = Math.sin(t * halfTheta) / sinHalfTheta;
  } else {
    // Nearly collinear: fall back to linear interpolation.
    scaleA = 1 - t;
    scaleB = t;
  }

  out.x = ax * scaleA + bx * scaleB;
  out.y = ay * scaleA + by * scaleB;
  out.z = az * scaleA + bz * scaleB;
  out.w = aw * scaleA + bw * scaleB;
}
