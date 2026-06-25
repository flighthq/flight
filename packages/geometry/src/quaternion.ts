import { createEntity } from '@flighthq/entity';
import type { EulerOrder, Matrix4Like, Quaternion, QuaternionLike, Vector3Like } from '@flighthq/types';

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
 * Returns the angle (in radians) between two unit quaternions. Returns 0 for identical
 * rotations and up to π for opposite rotations. Takes the shorter arc.
 */
export function getQuaternionAngleBetween(a: Readonly<QuaternionLike>, b: Readonly<QuaternionLike>): number {
  const dot = Math.abs(getQuaternionDot(a, b));
  return 2 * Math.acos(Math.min(1, dot));
}

/**
 * Returns the dot product of two quaternions: sum of component-wise products.
 * Useful for measuring the similarity of two orientations; `|dot| === 1` means identical.
 */
export function getQuaternionDot(a: Readonly<QuaternionLike>, b: Readonly<QuaternionLike>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/**
 * Extracts Euler angles (in radians) from a unit quaternion in the given `order`.
 * Defaults to `'XYZ'`. Writes the result to `out` as (x=angle around X, y=around Y, z=around Z).
 *
 * Note: Euler angles have a gimbal-lock singularity when the middle axis reaches ±90°. At the
 * singularity the decomposition is not unique; this implementation sets the third angle to 0
 * and puts all the rotation into the first angle (a common convention).
 */
export function getQuaternionEuler(
  out: Vector3Like,
  source: Readonly<QuaternionLike>,
  order: EulerOrder = 'XYZ',
): void {
  // True inverse of setQuaternionFromEuler: build the rotation matrix the set side implies
  // (m[row][col] of the unit-quaternion rotation), then read the Euler angles off that matrix
  // with the standard branch per order. Computing the matrix elements inline keeps this
  // allocation-free while guaranteeing set → get round-trips for every order.
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  const xx = x * x,
    yy = y * y,
    zz = z * z;
  const xy = x * y,
    xz = x * z,
    yz = y * z;
  const wx = w * x,
    wy = w * y,
    wz = w * z;

  const m00 = 1 - 2 * (yy + zz),
    m01 = 2 * (xy - wz),
    m02 = 2 * (xz + wy);
  const m10 = 2 * (xy + wz),
    m11 = 1 - 2 * (xx + zz),
    m12 = 2 * (yz - wx);
  const m20 = 2 * (xz - wy),
    m21 = 2 * (yz + wx),
    m22 = 1 - 2 * (xx + yy);

  switch (order) {
    case 'XYZ': {
      out.y = Math.asin(Math.min(1, Math.max(-1, m02)));
      if (Math.abs(m02) < 0.9999999) {
        out.x = Math.atan2(-m12, m22);
        out.z = Math.atan2(-m01, m00);
      } else {
        out.x = Math.atan2(m21, m11);
        out.z = 0;
      }
      break;
    }
    case 'XZY': {
      out.z = Math.asin(Math.min(1, Math.max(-1, -m01)));
      if (Math.abs(m01) < 0.9999999) {
        out.x = Math.atan2(m21, m11);
        out.y = Math.atan2(m02, m00);
      } else {
        out.x = Math.atan2(-m12, m22);
        out.y = 0;
      }
      break;
    }
    case 'YXZ': {
      out.x = Math.asin(Math.min(1, Math.max(-1, -m12)));
      if (Math.abs(m12) < 0.9999999) {
        out.y = Math.atan2(m02, m22);
        out.z = Math.atan2(m10, m11);
      } else {
        out.y = Math.atan2(-m20, m00);
        out.z = 0;
      }
      break;
    }
    case 'YZX': {
      out.z = Math.asin(Math.min(1, Math.max(-1, m10)));
      if (Math.abs(m10) < 0.9999999) {
        out.x = Math.atan2(-m12, m11);
        out.y = Math.atan2(-m20, m00);
      } else {
        out.x = 0;
        out.y = Math.atan2(m02, m22);
      }
      break;
    }
    case 'ZXY': {
      out.x = Math.asin(Math.min(1, Math.max(-1, m21)));
      if (Math.abs(m21) < 0.9999999) {
        out.y = Math.atan2(-m20, m22);
        out.z = Math.atan2(-m01, m11);
      } else {
        out.y = 0;
        out.z = Math.atan2(m10, m00);
      }
      break;
    }
    case 'ZYX': {
      out.y = Math.asin(Math.min(1, Math.max(-1, -m20)));
      if (Math.abs(m20) < 0.9999999) {
        out.x = Math.atan2(m21, m22);
        out.z = Math.atan2(m10, m00);
      } else {
        out.x = 0;
        out.z = Math.atan2(-m01, m11);
      }
      break;
    }
  }
}

/**
 * Writes the inverse of a quaternion. For unit quaternions this is the same as the conjugate;
 * for non-unit quaternions this divides the conjugate by the squared length.
 * A zero-length quaternion writes the identity rotation (0, 0, 0, 1).
 *
 * Safe when `out` aliases `source`.
 */
export function inverseQuaternion(out: QuaternionLike, source: Readonly<QuaternionLike>): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 1;
    return;
  }
  const inv = 1 / lenSq;
  out.x = -x * inv;
  out.y = -y * inv;
  out.z = -z * inv;
  out.w = w * inv;
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
 * Applies a quaternion rotation to a Vector3. Computes q * (0, v) * q^-1 using the
 * sandwich product, which rotates the vector by the quaternion's rotation.
 *
 * Safe when `out` aliases `vector` (all inputs are read into locals first).
 */
export function rotateVector3ByQuaternion(
  out: Vector3Like,
  vector: Readonly<Vector3Like>,
  q: Readonly<QuaternionLike>,
): void {
  // Rodrigues' rotation formula via quaternion sandwich product.
  const qx = q.x,
    qy = q.y,
    qz = q.z,
    qw = q.w;
  const vx = vector.x,
    vy = vector.y,
    vz = vector.z;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // out = v + q.w * t + cross(q.xyz, t)
  out.x = vx + qw * tx + (qy * tz - qz * ty);
  out.y = vy + qw * ty + (qz * tx - qx * tz);
  out.z = vz + qw * tz + (qx * ty - qy * tx);
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
 * Builds a quaternion from Euler angles (in radians) applied in the given `order`.
 * Defaults to `'XYZ'` order (intrinsic rotations — each rotation is about the local,
 * rotated axes).
 *
 * Safe when `out` has no aliasing concerns (scalars only).
 */
export function setQuaternionFromEuler(
  out: QuaternionLike,
  x: number,
  y: number,
  z: number,
  order: EulerOrder = 'XYZ',
): void {
  const c1 = Math.cos(x / 2),
    s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2),
    s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2),
    s3 = Math.sin(z / 2);

  switch (order) {
    case 'XYZ':
      out.x = s1 * c2 * c3 + c1 * s2 * s3;
      out.y = c1 * s2 * c3 - s1 * c2 * s3;
      out.z = c1 * c2 * s3 + s1 * s2 * c3;
      out.w = c1 * c2 * c3 - s1 * s2 * s3;
      break;
    case 'XZY':
      out.x = s1 * c2 * c3 - c1 * s2 * s3;
      out.y = c1 * s2 * c3 - s1 * c2 * s3;
      out.z = c1 * c2 * s3 + s1 * s2 * c3;
      out.w = c1 * c2 * c3 + s1 * s2 * s3;
      break;
    case 'YXZ':
      out.x = s1 * c2 * c3 + c1 * s2 * s3;
      out.y = c1 * s2 * c3 - s1 * c2 * s3;
      out.z = c1 * c2 * s3 - s1 * s2 * c3;
      out.w = c1 * c2 * c3 + s1 * s2 * s3;
      break;
    case 'YZX':
      out.x = s1 * c2 * c3 + c1 * s2 * s3;
      out.y = c1 * s2 * c3 + s1 * c2 * s3;
      out.z = c1 * c2 * s3 - s1 * s2 * c3;
      out.w = c1 * c2 * c3 - s1 * s2 * s3;
      break;
    case 'ZXY':
      out.x = s1 * c2 * c3 - c1 * s2 * s3;
      out.y = c1 * s2 * c3 + s1 * c2 * s3;
      out.z = c1 * c2 * s3 + s1 * s2 * c3;
      out.w = c1 * c2 * c3 - s1 * s2 * s3;
      break;
    case 'ZYX':
      out.x = s1 * c2 * c3 - c1 * s2 * s3;
      out.y = c1 * s2 * c3 + s1 * c2 * s3;
      out.z = c1 * c2 * s3 - s1 * s2 * c3;
      out.w = c1 * c2 * c3 + s1 * s2 * s3;
      break;
  }
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
 * Builds the shortest-arc rotation quaternion from unit vector `from` to unit vector `to`.
 *
 * Handles the antiparallel case (from ≈ -to) by choosing an arbitrary perpendicular axis
 * for a 180-degree rotation, so the result is always valid.
 *
 * Safe when `out` aliases `from` or `to`.
 */
export function setQuaternionFromUnitVectors(
  out: QuaternionLike,
  from: Readonly<Vector3Like>,
  to: Readonly<Vector3Like>,
): void {
  const fx = from.x,
    fy = from.y,
    fz = from.z;
  const tx = to.x,
    ty = to.y,
    tz = to.z;
  const dot = fx * tx + fy * ty + fz * tz;

  if (dot > 0.999999) {
    // Already aligned — identity
    setQuaternionIdentity(out);
    return;
  }

  if (dot < -0.999999) {
    // Antiparallel — 180-degree rotation about any perpendicular axis
    // Find an axis not parallel to `from`
    let ax = 1,
      ay = 0,
      az = 0;
    if (Math.abs(fx) > 0.9) {
      ax = 0;
      ay = 1;
      az = 0;
    }
    // perpendicular = cross(from, axis), normalized
    let px = fy * az - fz * ay;
    let py = fz * ax - fx * az;
    let pz = fx * ay - fy * ax;
    const pLen = Math.sqrt(px * px + py * py + pz * pz);
    px /= pLen;
    py /= pLen;
    pz /= pLen;
    out.x = px;
    out.y = py;
    out.z = pz;
    out.w = 0;
    return;
  }

  // General case: cross product gives the rotation axis * sin(theta/2)
  const cx = fy * tz - fz * ty;
  const cy = fz * tx - fx * tz;
  const cz = fx * ty - fy * tx;
  out.x = cx;
  out.y = cy;
  out.z = cz;
  out.w = 1 + dot;
  // normalize
  const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w);
  if (len !== 0) {
    const inv = 1 / len;
    out.x *= inv;
    out.y *= inv;
    out.z *= inv;
    out.w *= inv;
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
 * Builds a "look rotation" quaternion from a `forward` and an `up` direction. Both vectors are
 * assumed unit length.
 *
 * Axis convention (current, deterministic, undocumented design until the SDK look-rotation
 * convention is blessed): the implementation forms its orthonormal basis from the components of
 * `forward` swapped on the X/Z axes — internally it reads `(forward.z, forward.y, forward.x)` as
 * the basis "forward" and builds `right = forward × up`, `correctedUp = right × forward`, then
 * extracts the quaternion from the basis `[right, correctedUp, forward]`. As a consequence
 * `setQuaternionLookRotation(out, (0, 0, 1), (0, 1, 0))` is *not* identity — callers should rely
 * on the function's measured output for a given pair, not on a "+Z forward = identity" assumption.
 *
 * If `forward` and `up` are parallel or `forward` has zero length, the result is the
 * identity quaternion.
 *
 * Safe when `out` has no aliasing concerns.
 */
export function setQuaternionLookRotation(
  out: QuaternionLike,
  forward: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  const fz = forward.x,
    fy = forward.y,
    fx = forward.z;

  // right = forward × up (cross product)
  const ux = up.x,
    uy = up.y,
    uz = up.z;
  let rx = fy * uz - fz * uy;
  let ry = fz * ux - fx * uz;
  let rz = fx * uy - fy * ux;
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rLen === 0) {
    setQuaternionIdentity(out);
    return;
  }
  const rInv = 1 / rLen;
  rx *= rInv;
  ry *= rInv;
  rz *= rInv;

  // corrected up = right × forward
  const cu = { x: ry * fz - rz * fy, y: rz * fx - rx * fz, z: rx * fy - ry * fx };

  // Build rotation matrix from the orthonormal basis [right, correctedUp, forward]
  // then extract quaternion via trace
  const m00 = rx,
    m01 = cu.x,
    m02 = fz;
  const m10 = ry,
    m11 = cu.y,
    m12 = fy;
  const m20 = rz,
    m21 = cu.z,
    m22 = fx;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    out.w = 0.25 / s;
    out.x = (m12 - m21) * s;
    out.y = (m20 - m02) * s;
    out.z = (m01 - m10) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    out.w = (m12 - m21) / s;
    out.x = 0.25 * s;
    out.y = (m10 + m01) / s;
    out.z = (m20 + m02) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    out.w = (m20 - m02) / s;
    out.x = (m10 + m01) / s;
    out.y = 0.25 * s;
    out.z = (m21 + m12) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    out.w = (m01 - m10) / s;
    out.x = (m20 + m02) / s;
    out.y = (m21 + m12) / s;
    out.z = 0.25 * s;
  }
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
