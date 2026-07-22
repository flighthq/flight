import { createEntity } from '@flighthq/entity';
import type {
  Matrix3Like,
  Matrix4,
  Matrix4Like,
  MatrixLike,
  QuaternionLike,
  Vector3Like,
  Vector4Like,
} from '@flighthq/types';

import { acquireIdentityMatrix4, acquireMatrix4, releaseMatrix4 } from './matrix4Pool';

/**
 * Appends a matrix in world space (post-multiply).
 *
 * out = source · other
 */
export function appendMatrix4(out: Matrix4Like, source: Readonly<Matrix4Like>, other: Readonly<Matrix4Like>): void {
  // world-space append
  multiplyMatrix4(out, source, other);
}

/**
 * Applies a world-space rotation to the current matrix.
 *
 * Rotation is applied after all transformations of source are completed.
 *
 * @param radians rotation angle in radians (the @flighthq/geometry convention — convert a
 * designer-facing degree value with `DEG_TO_RAD` from `@flighthq/math`).
 **/
export function appendRotationMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  radians: number,
  axis: Readonly<Vector4Like>,
  pivotPoint?: Readonly<Vector4Like>,
): void {
  const m = acquireIdentityMatrix4();
  __getAxisRotation(m, axis.x, axis.y, axis.z, radians);

  if (pivotPoint !== undefined) {
    const p = pivotPoint;
    const t1 = acquireIdentityMatrix4();
    const t2 = acquireIdentityMatrix4();

    appendTranslationMatrix4(t1, t1, -p.x, -p.y, -p.z);
    appendTranslationMatrix4(t2, t2, p.x, p.y, p.z);

    multiplyMatrix4(m, t1, m); // R · T(-p)
    multiplyMatrix4(m, m, t2); // T(p) · (R · T(-p))

    releaseMatrix4(t1);
    releaseMatrix4(t2);
  }

  appendMatrix4(out, source, m);

  releaseMatrix4(m);
}

/**
 * Applies a world-space scale value to the source matrix.
 *
 * Scale is applied after all transformations of source are completed.
 **/
export function appendScaleMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  xScale: number,
  yScale: number,
  zScale: number,
): void {
  const m = acquireMatrix4();
  setMatrix4(m, xScale, 0.0, 0.0, 0.0, 0.0, yScale, 0.0, 0.0, 0.0, 0.0, zScale, 0.0, 0.0, 0.0, 0.0, 1.0);
  appendMatrix4(out, source, m);
  releaseMatrix4(m);
}

/**
 * Applies a world-space translation to source matrix.
 *
 * The new translation values are calculated as:
 *
 *   out.tx = source.tx + x
 *   out.ty = source.ty + y
 *   out.tz = source.tz + z
 *
 * Translation is applied after all transformations of source are completed.
 */
export function appendTranslationMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  x: number,
  y: number,
  z: number,
): void {
  const _out = out.m;
  const _source = source.m;
  if (out !== source) out.m.set(source.m);
  _out[12] = _source[12] + x;
  _out[13] = _source[13] + y;
  _out[14] = _source[14] + z;
}

export function cloneMatrix4(source: Readonly<Matrix4Like>): Matrix4 {
  const m = createMatrix4();
  copyMatrix4(m, source);
  return m;
}

/**
 * Composes a transform matrix from a translation, a rotation quaternion and a per-axis
 * scale: out = T · R · S. This is the inverse operation of decomposeMatrix4.
 *
 * `rotation` is assumed to be a unit quaternion. Safe when `out` does not alias any input
 * (the inputs are plain vector/quaternion entities, not the matrix itself).
 */
export function composeMatrix4(
  out: Matrix4Like,
  position: Readonly<Vector3Like>,
  rotation: Readonly<QuaternionLike>,
  scale: Readonly<Vector3Like>,
): void {
  const x = rotation.x,
    y = rotation.y,
    z = rotation.z,
    w = rotation.w;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;

  const sx = scale.x,
    sy = scale.y,
    sz = scale.z;

  const _out = out.m;
  _out[0] = (1 - (yy + zz)) * sx;
  _out[1] = (xy + wz) * sx;
  _out[2] = (xz - wy) * sx;
  _out[3] = 0;

  _out[4] = (xy - wz) * sy;
  _out[5] = (1 - (xx + zz)) * sy;
  _out[6] = (yz + wx) * sy;
  _out[7] = 0;

  _out[8] = (xz + wy) * sz;
  _out[9] = (yz - wx) * sz;
  _out[10] = (1 - (xx + yy)) * sz;
  _out[11] = 0;

  _out[12] = position.x;
  _out[13] = position.y;
  _out[14] = position.z;
  _out[15] = 1;
}

export function copyMatrix4(out: Matrix4Like, source: Readonly<Matrix4Like>): void {
  out.m.set(source.m);
}

/**
  Copies a column of data from a `Vector4Like` instance into the values of the target matrix
**/
export function copyMatrix4ColumnFromVector4(out: Matrix4Like, column: number, source: Readonly<Vector4Like>): void {
  const _out = out.m;
  switch (column) {
    case 0:
      _out[0] = source.x;
      _out[1] = source.y;
      _out[2] = source.z;
      _out[3] = source.w;
      break;

    case 1:
      _out[4] = source.x;
      _out[5] = source.y;
      _out[6] = source.z;
      _out[7] = source.w;
      break;

    case 2:
      _out[8] = source.x;
      _out[9] = source.y;
      _out[10] = source.z;
      _out[11] = source.w;
      break;

    case 3:
      _out[12] = source.x;
      _out[13] = source.y;
      _out[14] = source.z;
      _out[15] = source.w;
      break;

    default:
      throw new RangeError('Column ' + column + ' out of bounds [0, ..., 3]');
  }
}

/**
 * Copies a column of data from the source matrix into a `Vector4Like` instance
 **/
export function copyMatrix4ColumnToVector4(out: Vector4Like, column: number, source: Readonly<Matrix4Like>): void {
  const _source = source.m;
  switch (column) {
    case 0:
      out.x = _source[0];
      out.y = _source[1];
      out.z = _source[2];
      out.w = _source[3];
      break;

    case 1:
      out.x = _source[4];
      out.y = _source[5];
      out.z = _source[6];
      out.w = _source[7];
      break;

    case 2:
      out.x = _source[8];
      out.y = _source[9];
      out.z = _source[10];
      out.w = _source[11];
      break;

    case 3:
      out.x = _source[12];
      out.y = _source[13];
      out.z = _source[14];
      out.w = _source[15];
      break;

    default:
      throw new RangeError('Column ' + column + ' out of bounds [0, ..., 3]');
  }
}

/**
 * Copies a row of data from a `Vector4Like` instance into the values of the out matrix
 **/
export function copyMatrix4RowFromVector4(out: Matrix4Like, row: number, source: Readonly<Vector4Like>): void {
  const _out = out.m;
  switch (row) {
    case 0:
      _out[0] = source.x;
      _out[4] = source.y;
      _out[8] = source.z;
      _out[12] = source.w;
      break;

    case 1:
      _out[1] = source.x;
      _out[5] = source.y;
      _out[9] = source.z;
      _out[13] = source.w;
      break;

    case 2:
      _out[2] = source.x;
      _out[6] = source.y;
      _out[10] = source.z;
      _out[14] = source.w;
      break;

    case 3:
      _out[3] = source.x;
      _out[7] = source.y;
      _out[11] = source.z;
      _out[15] = source.w;
      break;

    default:
      throw new RangeError('Row ' + row + ' out of bounds [0, ..., 3]');
  }
}

/**
 * Copies a row of data from the source matrix into a `Vector4Like` instance
 **/
export function copyMatrix4RowToVector4(out: Vector4Like, row: number, source: Readonly<Matrix4Like>): void {
  const _source = source.m;
  switch (row) {
    case 0:
      out.x = _source[0];
      out.y = _source[4];
      out.z = _source[8];
      out.w = _source[12];
      break;

    case 1:
      out.x = _source[1];
      out.y = _source[5];
      out.z = _source[9];
      out.w = _source[13];
      break;

    case 2:
      out.x = _source[2];
      out.y = _source[6];
      out.z = _source[10];
      out.w = _source[14];
      break;

    case 3:
      out.x = _source[3];
      out.y = _source[7];
      out.z = _source[11];
      out.w = _source[15];
      break;

    default:
      throw new RangeError('Row ' + row + ' out of bounds [0, ..., 3]');
  }
}

/**
 * A 4×4 homogeneous matrix.
 *
 * [ m00 m10 m20 m30 ]
 * [ m01 m11 m21 m31 ]
 * [ m02 m12 m22 m32 ]
 * [ m03 m13 m23 m33 ]
 *
 * Storage is column-major (OpenGL-compatible).
 *
 * This matrix assumes column vectors, multiplied on the right:
 * v' = M · v
 */
export function createMatrix4(
  m00?: number,
  m01?: number,
  m02?: number,
  m03?: number,
  m10?: number,
  m11?: number,
  m12?: number,
  m13?: number,
  m20?: number,
  m21?: number,
  m22?: number,
  m23?: number,
  m30?: number,
  m31?: number,
  m32?: number,
  m33?: number,
): Matrix4 {
  const m = new Float32Array(__identity);
  const out: Matrix4 = createEntity({ m: m });
  if (m00 !== undefined) m[0] = m00;
  if (m01 !== undefined) m[1] = m01;
  if (m02 !== undefined) m[2] = m02;
  if (m03 !== undefined) m[3] = m03;
  if (m10 !== undefined) m[4] = m10;
  if (m11 !== undefined) m[5] = m11;
  if (m12 !== undefined) m[6] = m12;
  if (m13 !== undefined) m[7] = m13;
  if (m20 !== undefined) m[8] = m20;
  if (m21 !== undefined) m[9] = m21;
  if (m22 !== undefined) m[10] = m22;
  if (m23 !== undefined) m[11] = m23;
  if (m30 !== undefined) m[12] = m30;
  if (m31 !== undefined) m[13] = m31;
  if (m32 !== undefined) m[14] = m32;
  if (m33 !== undefined) m[15] = m33;
  return out;
}

/**
 * Creates a matrix using two-dimensional transform values
 **/
export function createMatrix4From2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): Matrix4 {
  const out = createMatrix4();
  setMatrix4From2D(out, a, b, c, d, tx, ty);
  return out;
}

/**
 * Initializes this matrix with values for an orthographic projection, useful in rendering
 **/
export function createOrthographicMatrix4(
  left: number,
  right: number,
  bottom: number,
  top: number,
  zNear: number,
  zFar: number,
): Matrix4 {
  const out = createMatrix4();
  setOrthographicMatrix4(out, left, right, bottom, top, zNear, zFar);
  return out;
}

/**
 * Initializes this matrix with values for a perspective projection
 **/
export function createPerspectiveMatrix4(fov: number, aspect: number, zNear: number, zFar: number): Matrix4 {
  const out = createMatrix4();
  setPerspectiveMatrix4(out, fov, aspect, zNear, zFar);
  return out;
}

/**
 * Decomposes a transform matrix into its translation, rotation quaternion and per-axis
 * scale, the inverse of composeMatrix4. Assumes the matrix is a TRS composition (no shear);
 * a negative determinant flips the X scale sign so the extracted rotation stays a proper
 * rotation.
 *
 * Reads the matrix into locals before writing, so it is safe for the outputs to alias
 * fields of unrelated entities; the matrix `m` is read-only.
 */
export function decomposeMatrix4(
  outPosition: Vector3Like,
  outRotation: QuaternionLike,
  outScale: Vector3Like,
  m: Readonly<Matrix4Like>,
): void {
  const _m = m.m;

  const m00 = _m[0],
    m01 = _m[1],
    m02 = _m[2];
  const m10 = _m[4],
    m11 = _m[5],
    m12 = _m[6];
  const m20 = _m[8],
    m21 = _m[9],
    m22 = _m[10];
  const tx = _m[12],
    ty = _m[13],
    tz = _m[14];

  let sx = Math.sqrt(m00 * m00 + m01 * m01 + m02 * m02);
  const sy = Math.sqrt(m10 * m10 + m11 * m11 + m12 * m12);
  const sz = Math.sqrt(m20 * m20 + m21 * m21 + m22 * m22);

  // A negative determinant means an odd number of mirror flips; fold it into X.
  const det = m00 * (m11 * m22 - m12 * m21) - m10 * (m01 * m22 - m02 * m21) + m20 * (m01 * m12 - m02 * m11);
  if (det < 0) sx = -sx;

  outPosition.x = tx;
  outPosition.y = ty;
  outPosition.z = tz;

  outScale.x = sx;
  outScale.y = sy;
  outScale.z = sz;

  const invSx = sx !== 0 ? 1 / sx : 0;
  const invSy = sy !== 0 ? 1 / sy : 0;
  const invSz = sz !== 0 ? 1 / sz : 0;

  // Normalized rotation basis (column-major upper 3×3).
  const r00 = m00 * invSx,
    r01 = m01 * invSx,
    r02 = m02 * invSx;
  const r10 = m10 * invSy,
    r11 = m11 * invSy,
    r12 = m12 * invSy;
  const r20 = m20 * invSz,
    r21 = m21 * invSz,
    r22 = m22 * invSz;

  const trace = r00 + r11 + r22;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    outRotation.w = 0.25 / s;
    outRotation.x = (r12 - r21) * s;
    outRotation.y = (r20 - r02) * s;
    outRotation.z = (r01 - r10) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
    outRotation.w = (r12 - r21) / s;
    outRotation.x = 0.25 * s;
    outRotation.y = (r10 + r01) / s;
    outRotation.z = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
    outRotation.w = (r20 - r02) / s;
    outRotation.x = (r10 + r01) / s;
    outRotation.y = 0.25 * s;
    outRotation.z = (r21 + r12) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
    outRotation.w = (r01 - r10) / s;
    outRotation.x = (r20 + r02) / s;
    outRotation.y = (r21 + r12) / s;
    outRotation.z = 0.25 * s;
  }
}

export function equalsMatrix4(
  a: Readonly<Matrix4Like> | null | undefined,
  b: Readonly<Matrix4Like> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (let i = 0; i < 16; i++) {
    if (a.m[i] !== b.m[i]) return false;
  }
  return true;
}

export function getMatrix4Determinant(source: Readonly<Matrix4Like>): number {
  const _source = source.m;
  return (
    1 *
    ((_source[0] * _source[5] - _source[4] * _source[1]) * (_source[10] * _source[15] - _source[14] * _source[11]) -
      (_source[0] * _source[9] - _source[8] * _source[1]) * (_source[6] * _source[15] - _source[14] * _source[7]) +
      (_source[0] * _source[13] - _source[12] * _source[1]) * (_source[6] * _source[11] - _source[10] * _source[7]) +
      (_source[4] * _source[9] - _source[8] * _source[5]) * (_source[2] * _source[15] - _source[14] * _source[3]) -
      (_source[4] * _source[13] - _source[12] * _source[5]) * (_source[2] * _source[11] - _source[10] * _source[3]) +
      (_source[8] * _source[13] - _source[12] * _source[9]) * (_source[2] * _source[7] - _source[6] * _source[3]))
  );
}

export function getMatrix4Element(source: Readonly<Matrix4Like>, row: number, column: number): number {
  return source.m[column * 4 + row];
}

export function getMatrix4Position(out: Vector3Like, source: Readonly<Matrix4Like>): void {
  const _source = source.m;
  out.x = _source[12];
  out.y = _source[13];
  out.z = _source[14];
}

/**
 * Interpolates from one `Matrix4Like` instance to another, given a percentage between the two
 **/
export function interpolateMatrix4(
  out: Matrix4Like,
  a: Readonly<Matrix4Like>,
  b: Readonly<Matrix4Like>,
  t: number,
): void {
  const _out = out.m;
  const _a = a.m;
  const _b = b.m;
  for (let i = 0; i < 16; i++) {
    _out[i] = _a[i] + (_b[i] - _a[i]) * t;
  }
}

/**
 * Attempts to invert the current matrix, so long as the determinant is greater than zero
 **/
export function inverseMatrix4(out: Matrix4Like, source: Readonly<Matrix4Like>): boolean {
  const _out = out.m;
  const _source = source.m;

  // Calculate determinant
  let d = getMatrix4Determinant(source);

  // Threshold for determining if matrix is invertible
  const EPS = 1e-6;
  const invertable = Math.abs(d) > EPS;

  if (!invertable) {
    // If the matrix is singular, set output to NaN or Identity
    _out.fill(NaN); // Set all elements to NaN (or you could set to the identity matrix, depending on your preference)
    return false;
  }

  // Invertable matrix, proceed with inversion
  d = 1 / d;

  // Decompose the matrix into elements for readability
  const m11 = _source[0],
    m21 = _source[4],
    m31 = _source[8],
    m41 = _source[12];
  const m12 = _source[1],
    m22 = _source[5],
    m32 = _source[9],
    m42 = _source[13];
  const m13 = _source[2],
    m23 = _source[6],
    m33 = _source[10],
    m43 = _source[14];
  const m14 = _source[3],
    m24 = _source[7],
    m34 = _source[11],
    m44 = _source[15];

  // Perform matrix inversion based on the determinant
  _out[0] = d * (m22 * (m33 * m44 - m43 * m34) - m32 * (m23 * m44 - m43 * m24) + m42 * (m23 * m34 - m33 * m24));
  _out[1] = -d * (m12 * (m33 * m44 - m43 * m34) - m32 * (m13 * m44 - m43 * m14) + m42 * (m13 * m34 - m33 * m14));
  _out[2] = d * (m12 * (m23 * m44 - m43 * m24) - m22 * (m13 * m44 - m43 * m14) + m42 * (m13 * m24 - m23 * m14));
  _out[3] = -d * (m12 * (m23 * m34 - m33 * m24) - m22 * (m13 * m34 - m33 * m14) + m32 * (m13 * m24 - m23 * m14));

  _out[4] = -d * (m21 * (m33 * m44 - m43 * m34) - m31 * (m23 * m44 - m43 * m24) + m41 * (m23 * m34 - m33 * m24));
  _out[5] = d * (m11 * (m33 * m44 - m43 * m34) - m31 * (m13 * m44 - m43 * m14) + m41 * (m13 * m34 - m33 * m14));
  _out[6] = -d * (m11 * (m23 * m44 - m43 * m24) - m21 * (m13 * m44 - m43 * m14) + m41 * (m13 * m24 - m23 * m14));
  _out[7] = d * (m11 * (m23 * m34 - m33 * m24) - m21 * (m13 * m34 - m33 * m14) + m31 * (m13 * m24 - m23 * m14));

  _out[8] = d * (m21 * (m32 * m44 - m42 * m34) - m31 * (m22 * m44 - m42 * m24) + m41 * (m22 * m34 - m32 * m24));
  _out[9] = -d * (m11 * (m32 * m44 - m42 * m34) - m31 * (m12 * m44 - m42 * m14) + m41 * (m12 * m34 - m32 * m14));
  _out[10] = d * (m11 * (m22 * m44 - m42 * m24) - m21 * (m12 * m44 - m42 * m14) + m41 * (m12 * m24 - m22 * m14));
  _out[11] = -d * (m11 * (m22 * m34 - m32 * m24) - m21 * (m12 * m34 - m32 * m14) + m31 * (m12 * m24 - m22 * m14));

  _out[12] = -d * (m21 * (m32 * m43 - m42 * m33) - m31 * (m22 * m43 - m42 * m23) + m41 * (m22 * m33 - m32 * m23));
  _out[13] = d * (m11 * (m32 * m43 - m42 * m33) - m31 * (m12 * m43 - m42 * m13) + m41 * (m12 * m33 - m32 * m13));
  _out[14] = -d * (m11 * (m22 * m43 - m42 * m23) - m21 * (m12 * m43 - m42 * m13) + m41 * (m12 * m23 - m22 * m13));
  _out[15] = d * (m11 * (m22 * m33 - m32 * m23) - m21 * (m12 * m33 - m32 * m13) + m31 * (m12 * m23 - m22 * m13));

  return invertable;
}

export function isAffineMatrix4(source: Readonly<Matrix4Like>): boolean {
  const _source = source.m;
  return _source[3] === 0 && _source[7] === 0 && _source[11] === 0 && _source[15] === 1;
}

/**
 * Transforms a point using this matrix, including the translation of the matrix.
 **/
export function matrix4TransformPoint(
  out: Vector3Like,
  source: Readonly<Matrix4Like>,
  point: Readonly<Vector3Like>,
): void {
  const _source = source.m;
  const x = point.x,
    y = point.y,
    z = point.z;
  out.x = x * _source[0] + y * _source[4] + z * _source[8] + _source[12];
  out.y = x * _source[1] + y * _source[5] + z * _source[9] + _source[13];
  out.z = x * _source[2] + y * _source[6] + z * _source[10] + _source[14];
}

/**
 * Transforms a `Vector4Like` instance using this matrix.
 **/
export function matrix4TransformVector(
  out: Vector4Like,
  source: Readonly<Matrix4Like>,
  vector: Readonly<Vector4Like>,
): void {
  const _source = source.m;
  const x = vector.x,
    y = vector.y,
    z = vector.z,
    w = vector.w;
  out.x = x * _source[0] + y * _source[4] + z * _source[8] + w * _source[12];
  out.y = x * _source[1] + y * _source[5] + z * _source[9] + w * _source[13];
  out.z = x * _source[2] + y * _source[6] + z * _source[10] + w * _source[14];
  out.w = x * _source[3] + y * _source[7] + z * _source[11] + w * _source[15];
}

/**
 * Transforms a series of [x, y, z] triples at once.
 **/
export function matrix4TransformVectors(
  out: Float32Array,
  source: Readonly<Matrix4Like>,
  vectors: Readonly<Float32Array>,
): void {
  const _source = source.m;
  let i = 0;
  let x: number, y: number, z: number;

  while (i + 3 <= vectors.length) {
    x = vectors[i];
    y = vectors[i + 1];
    z = vectors[i + 2];

    out[i] = x * _source[0] + y * _source[4] + z * _source[8] + _source[12];
    out[i + 1] = x * _source[1] + y * _source[5] + z * _source[9] + _source[13];
    out[i + 2] = x * _source[2] + y * _source[6] + z * _source[10] + _source[14];

    i += 3;
  }
}

/**
 * Matrix multiplication
 *
 * out = a * b
 **/
export function multiplyMatrix4(out: Matrix4Like, a: Readonly<Matrix4Like>, b: Readonly<Matrix4Like>): void {
  const _a = a.m;
  const _b = b.m;
  const _out = out.m;

  const m111 = _a[0],
    m121 = _a[4],
    m131 = _a[8],
    m141 = _a[12],
    m112 = _a[1],
    m122 = _a[5],
    m132 = _a[9],
    m142 = _a[13],
    m113 = _a[2],
    m123 = _a[6],
    m133 = _a[10],
    m143 = _a[14],
    m114 = _a[3],
    m124 = _a[7],
    m134 = _a[11],
    m144 = _a[15],
    m211 = _b[0],
    m221 = _b[4],
    m231 = _b[8],
    m241 = _b[12],
    m212 = _b[1],
    m222 = _b[5],
    m232 = _b[9],
    m242 = _b[13],
    m213 = _b[2],
    m223 = _b[6],
    m233 = _b[10],
    m243 = _b[14],
    m214 = _b[3],
    m224 = _b[7],
    m234 = _b[11],
    m244 = _b[15];

  // Note the switched order of matrix a and matrix b
  _out[0] = m211 * m111 + m212 * m121 + m213 * m131 + m214 * m141;
  _out[1] = m211 * m112 + m212 * m122 + m213 * m132 + m214 * m142;
  _out[2] = m211 * m113 + m212 * m123 + m213 * m133 + m214 * m143;
  _out[3] = m211 * m114 + m212 * m124 + m213 * m134 + m214 * m144;

  _out[4] = m221 * m111 + m222 * m121 + m223 * m131 + m224 * m141;
  _out[5] = m221 * m112 + m222 * m122 + m223 * m132 + m224 * m142;
  _out[6] = m221 * m113 + m222 * m123 + m223 * m133 + m224 * m143;
  _out[7] = m221 * m114 + m222 * m124 + m223 * m134 + m224 * m144;

  _out[8] = m231 * m111 + m232 * m121 + m233 * m131 + m234 * m141;
  _out[9] = m231 * m112 + m232 * m122 + m233 * m132 + m234 * m142;
  _out[10] = m231 * m113 + m232 * m123 + m233 * m133 + m234 * m143;
  _out[11] = m231 * m114 + m232 * m124 + m233 * m134 + m234 * m144;

  _out[12] = m241 * m111 + m242 * m121 + m243 * m131 + m244 * m141;
  _out[13] = m241 * m112 + m242 * m122 + m243 * m132 + m244 * m142;
  _out[14] = m241 * m113 + m242 * m123 + m243 * m133 + m244 * m143;
  _out[15] = m241 * m114 + m242 * m124 + m243 * m134 + m244 * m144;
}

/**
 * Prepends a matrix in world space (pre-multiply).
 *
 * out = other · source
 */
export function prependMatrix4(out: Matrix4Like, source: Readonly<Matrix4Like>, other: Readonly<Matrix4Like>): void {
  multiplyMatrix4(out, other, source);
}

/**
 * Prepends rotation before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 *
 * @param radians rotation angle in radians (the @flighthq/geometry convention — convert a
 * designer-facing degree value with `DEG_TO_RAD` from `@flighthq/math`).
 **/
export function prependRotationMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  radians: number,
  axis: Readonly<Vector4Like>,
  pivotPoint?: Readonly<Vector4Like>,
): void {
  const m = acquireIdentityMatrix4();
  __getAxisRotation(m, axis.x, axis.y, axis.z, radians);

  if (pivotPoint !== undefined) {
    const p = pivotPoint;
    const t1 = acquireIdentityMatrix4();
    const t2 = acquireIdentityMatrix4();

    appendTranslationMatrix4(t1, t1, -p.x, -p.y, -p.z);
    appendTranslationMatrix4(t2, t2, p.x, p.y, p.z);

    multiplyMatrix4(m, m, t1); // R · T(-p)
    multiplyMatrix4(m, t2, m); // T(p) · (R · T(-p))

    releaseMatrix4(t1);
    releaseMatrix4(t2);
  }

  prependMatrix4(out, source, m);

  releaseMatrix4(m);
}

/**
 * Prepends scale before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 **/
export function prependScaleMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  xScale: number,
  yScale: number,
  zScale: number,
): void {
  const m = acquireMatrix4();
  setMatrix4(m, xScale, 0.0, 0.0, 0.0, 0.0, yScale, 0.0, 0.0, 0.0, 0.0, zScale, 0.0, 0.0, 0.0, 0.0, 1.0);
  prependMatrix4(out, source, m);
  releaseMatrix4(m);
}

/**
 * Prepends a translation before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 */
export function prependTranslationMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  x: number,
  y: number,
  z: number,
): void {
  const m = acquireIdentityMatrix4();
  translateMatrix4(m, m, x, y, z); // LOCAL translation matrix
  multiplyMatrix4(out, m, source);
  releaseMatrix4(m);
}

/**
 * Applies a local-space rotation relative to the matrix's existing orientation.
 *
 * Translation is preserved.
 *
 * @param radians rotation angle in radians (the @flighthq/geometry convention — convert a
 * designer-facing degree value with `DEG_TO_RAD` from `@flighthq/math`).
 */
export function rotateMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  axis: Readonly<Vector3Like>,
  radians: number,
): void {
  const m = acquireIdentityMatrix4();
  __getAxisRotation(m, axis.x, axis.y, axis.z, radians);
  multiplyMatrix4(out, source, m);
  releaseMatrix4(m);
}

/**
 * Applies a local-space scale relative to the matrix's existing orientation.
 *
 * Translation is preserved.
 */
export function scaleMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  sx: number,
  sy: number,
  sz: number,
): void {
  const a = source.m;
  const o = out.m;

  if (out !== source) out.m.set(source.m);

  if (sx !== 1) {
    o[0] = a[0] * sx;
    o[4] = a[4] * sx;
    o[8] = a[8] * sx;
  }

  if (sy !== 1) {
    o[1] = a[1] * sy;
    o[5] = a[5] * sy;
    o[9] = a[9] * sy;
  }

  if (sz !== 1) {
    o[2] = a[2] * sz;
    o[6] = a[6] * sz;
    o[10] = a[10] * sz;
  }
}

export function setMatrix4(
  out: Matrix4Like,
  m00: number,
  m01: number,
  m02: number,
  m03: number,
  m10: number,
  m11: number,
  m12: number,
  m13: number,
  m20: number,
  m21: number,
  m22: number,
  m23: number,
  m30: number,
  m31: number,
  m32: number,
  m33: number,
): void {
  const _out = out.m;
  _out[0] = m00;
  _out[1] = m01;
  _out[2] = m02;
  _out[3] = m03;
  _out[4] = m10;
  _out[5] = m11;
  _out[6] = m12;
  _out[7] = m13;
  _out[8] = m20;
  _out[9] = m21;
  _out[10] = m22;
  _out[11] = m23;
  _out[12] = m30;
  _out[13] = m31;
  _out[14] = m32;
  _out[15] = m33;
}

export function setMatrix4Element(out: Matrix4Like, row: number, column: number, value: number): void {
  out.m[column * 4 + row] = value;
}

/**
 * Resets the current matrix using two-dimensional transform values
 **/
export function setMatrix4From2D(
  out: Matrix4Like,
  a: number,
  b: number,
  c: number,
  d: number,
  tx?: number,
  ty?: number,
): void {
  const _out = out.m;
  tx = tx ?? 0;
  ty = ty ?? 0;

  _out[0] = a;
  _out[1] = b;
  _out[2] = 0;
  _out[3] = 0;

  _out[4] = c;
  _out[5] = d;
  _out[6] = 0;
  _out[7] = 0;

  _out[8] = 0;
  _out[9] = 0;
  _out[10] = 1;
  _out[11] = 0;

  _out[12] = tx;
  _out[13] = ty;
  _out[14] = 0;
  _out[15] = 1;
}

/**
 * Reads 16 elements of a column-major Float32Array at `offset` into a Matrix4Like.
 *
 * Mirrors `writeMatrix4ToFloat32Array` and matches the existing vec2/3/4 and Matrix3 bridges.
 */
export function setMatrix4FromFloat32Array(out: Matrix4Like, offset: number, source: Readonly<Float32Array>): void {
  out.m.set(source.subarray(offset, offset + 16));
}

export function setMatrix4FromMatrix(out: Matrix4Like, source: Readonly<MatrixLike>): void {
  setMatrix4From2D(out, source.a, source.b, source.c, source.d, source.tx, source.ty);
}

export function setMatrix4FromMatrix3(out: Matrix4Like, source: Readonly<Matrix3Like>): void {
  const _out = out.m;
  const _source = source.m;
  // Column-major Matrix3: linear/translation via (0,0),(0,1),(1,0),(1,1),(0,2),(1,2), then the bottom
  // row (2,0),(2,1),(2,2) into Matrix4's z row.
  setMatrix4From2D(out, _source[0], _source[3], _source[1], _source[4], _source[6], _source[7]);
  _out[2] = _source[2];
  _out[6] = _source[5];
  _out[10] = _source[8];
}

/**
 * Writes the rotation described by a unit quaternion into the upper-left 3×3 of an
 * identity matrix (translation cleared, bottom row 0,0,0,1). glTF handedness.
 */
export function setMatrix4FromQuaternion(out: Matrix4Like, source: Readonly<QuaternionLike>): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;

  const _out = out.m;
  _out[0] = 1 - (yy + zz);
  _out[1] = xy + wz;
  _out[2] = xz - wy;
  _out[3] = 0;

  _out[4] = xy - wz;
  _out[5] = 1 - (xx + zz);
  _out[6] = yz + wx;
  _out[7] = 0;

  _out[8] = xz + wy;
  _out[9] = yz - wx;
  _out[10] = 1 - (xx + yy);
  _out[11] = 0;

  _out[12] = 0;
  _out[13] = 0;
  _out[14] = 0;
  _out[15] = 1;
}

/**
 * Resets the current matrix using default identity values
 **/
export function setMatrix4Identity(out: Matrix4Like): void {
  setMatrix4(out, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/**
 * Builds a right-handed look-at view matrix that positions a camera at `eye` looking toward
 * `target`, with `up` defining the camera roll. The forward axis points from eye to target;
 * the resulting matrix transforms world-space points into view space.
 *
 * Reads all inputs into locals before writing, so it is safe when `out` is unrelated to the
 * vector inputs.
 */
export function setMatrix4LookAt(
  out: Matrix4Like,
  eye: Readonly<Vector3Like>,
  target: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  const eyeX = eye.x,
    eyeY = eye.y,
    eyeZ = eye.z;

  // z axis = normalize(eye - target) (points from target back toward the eye, RH).
  let zx = eyeX - target.x;
  let zy = eyeY - target.y;
  let zz = eyeZ - target.z;
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (zl === 0) {
    zz = 1;
    zl = 1;
  }
  zx /= zl;
  zy /= zl;
  zz /= zl;

  // x axis = normalize(cross(up, z)).
  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  let xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (xl === 0) {
    xx = 0;
    xy = 0;
    xz = 0;
  } else {
    xx /= xl;
    xy /= xl;
    xz /= xl;
  }

  // y axis = cross(z, x) (already orthonormal).
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const _out = out.m;
  _out[0] = xx;
  _out[1] = yx;
  _out[2] = zx;
  _out[3] = 0;

  _out[4] = xy;
  _out[5] = yy;
  _out[6] = zy;
  _out[7] = 0;

  _out[8] = xz;
  _out[9] = yz;
  _out[10] = zz;
  _out[11] = 0;

  _out[12] = -(xx * eyeX + xy * eyeY + xz * eyeZ);
  _out[13] = -(yx * eyeX + yy * eyeY + yz * eyeZ);
  _out[14] = -(zx * eyeX + zy * eyeY + zz * eyeZ);
  _out[15] = 1;
}

export function setMatrix4Position(out: Matrix4Like, source: Readonly<Vector3Like>): void {
  const _out = out.m;
  _out[12] = source.x;
  _out[13] = source.y;
  _out[14] = source.z;
}

/**
 * Initializes a matrix with values for an orthographic projection, useful in rendering
 **/
export function setOrthographicMatrix4(
  out: Matrix4Like,
  left: number,
  right: number,
  bottom: number,
  top: number,
  zNear: number,
  zFar: number,
): void {
  const _out = out.m;
  const sx = 1.0 / (right - left);
  const sy = 1.0 / (top - bottom);
  const sz = 1.0 / (zFar - zNear);

  _out[0] = 2 * sx;
  _out[1] = 0;
  _out[2] = 0;
  _out[3] = 0;

  _out[4] = 0;
  _out[5] = 2 * sy;
  _out[6] = 0;
  _out[7] = 0;

  _out[8] = 0;
  _out[9] = 0;
  _out[10] = -2 * sz;
  _out[11] = 0;

  _out[12] = -(left + right) * sx;
  _out[13] = -(bottom + top) * sy;
  _out[14] = -(zNear + zFar) * sz;
  _out[15] = 1;
}

/**
 * Initializes a matrix with values for a perspective projection
 **/
export function setPerspectiveMatrix4(
  out: Matrix4Like,
  fov: number,
  aspect: number,
  zNear: number,
  zFar: number,
): void {
  if (aspect > -0.0000001 && aspect < 0.0000001) {
    throw new Error('Aspect ratio may not be 0');
  }

  const _out = out.m;
  const top = fov * zNear;
  const bottom = -top;
  const right = top * aspect;
  const left = -right;

  _out[0] = (2.0 * zNear) / (right - left);
  _out[1] = 0;
  _out[2] = 0;
  _out[3] = 0;

  _out[4] = 0;
  _out[5] = (2.0 * zNear) / (top - bottom);
  _out[6] = 0;
  _out[7] = 0;

  _out[8] = (right + left) / (right - left);
  _out[9] = (top + bottom) / (top - bottom);
  // Evaluate the infinite-far limit explicitly. Direct Infinity/Infinity arithmetic would poison
  // a perspective camera whose source format deliberately omits a finite far plane.
  _out[10] = zFar === Number.POSITIVE_INFINITY ? -1 : -(zFar + zNear) / (zFar - zNear);
  _out[11] = -1.0;

  _out[12] = 0;
  _out[13] = 0;
  _out[14] = zFar === Number.POSITIVE_INFINITY ? -2 * zNear : (-2 * zFar * zNear) / (zFar - zNear);
  // Row-3 of a perspective matrix is (0, 0, -1, 0): m[11] = -1 routes -z_eye into clip w, and m[15]
  // MUST be 0 so w = -z (not -z + w_in). A stray 1 here (identity leftover) makes w = -z + 1, which
  // shrinks projected geometry toward the near plane.
  _out[15] = 0;
}

/**
 * Applies a local-space translation to the matrix, taking into account the source matrix's rotation and scale.
 *
 * Translation is applied respecting using all other transformations of source.
 */
export function translateMatrix4(
  out: Matrix4Like,
  source: Readonly<Matrix4Like>,
  tx: number,
  ty: number,
  tz: number,
): void {
  const a = source.m;
  const o = out.m;
  if (out !== source) out.m.set(source.m);
  o[12] = a[0] * tx + a[4] * ty + a[8] * tz + a[12];
  o[13] = a[1] * tx + a[5] * ty + a[9] * tz + a[13];
  o[14] = a[2] * tx + a[6] * ty + a[10] * tz + a[14];
}

export function transposeMatrix4(out: Matrix4Like, source: Readonly<Matrix4Like>): void {
  if (out !== source) out.m.set(source.m);
  __swap(out, source, 1, 4);
  __swap(out, source, 2, 8);
  __swap(out, source, 3, 12);
  __swap(out, source, 6, 9);
  __swap(out, source, 7, 13);
  __swap(out, source, 11, 14);
}

/**
 * Transposes the matrix (swaps rows and columns).
 *
 * Note:
 * - Storage order (column-major) is unchanged
 * - This is a mathematical transpose, not a memory layout conversion
 *
 * Common uses:
 * - Computing inverse-transpose for normals
 * - Switching between row- and column-vector math conventions
 */
/**
 * Writes 16 column-major elements of a Matrix4Like into a Float32Array at `offset`.
 *
 * Mirrors `setMatrix4FromFloat32Array` and the existing vec2/3/4 and Matrix3 bridges.
 */
export function writeMatrix4ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Matrix4Like>): void {
  out.set(source.m, offset);
}

function __getAxisRotation(out: Matrix4Like, x: number, y: number, z: number, radians: number): void {
  const _out = out.m;
  let ax = x,
    ay = y,
    az = z;

  // Negated to preserve the rotation handedness the degrees-based version produced; the caller's
  // angle is already radians (the @flighthq/geometry math-layer convention), so no unit conversion.
  const rad = -radians;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1.0 - c;

  _out[0] = c + ax * ax * t;
  _out[5] = c + ay * ay * t;
  _out[10] = c + az * az * t;

  let tmp1 = ax * ay * t;
  let tmp2 = az * s;
  _out[4] = tmp1 + tmp2;
  _out[1] = tmp1 - tmp2;
  tmp1 = ax * az * t;
  tmp2 = ay * s;
  _out[8] = tmp1 - tmp2;
  _out[2] = tmp1 + tmp2;
  tmp1 = ay * az * t;
  tmp2 = ax * s;
  _out[9] = tmp1 + tmp2;
  _out[6] = tmp1 - tmp2;
}

function __swap(out: Matrix4Like, source: Readonly<Matrix4Like>, a: number, b: number): void {
  const temp = source.m[a];
  out.m[a] = source.m[b];
  out.m[b] = temp;
}

const __identity: Float32Array = new Float32Array([
  1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
]);
