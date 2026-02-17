import type { Matrix3x2, Matrix3x3, Matrix4x4, Vector3, Vector4 } from '@flighthq/types';

import * as matrix4x4Pool from './matrix4x4Pool.js';

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
export function create(
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
): Matrix4x4 {
  const m = new Float32Array(__identity);
  const out: Matrix4x4 = { m: m };
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
 * Appends a matrix in world space (post-multiply).
 *
 * out = source · other
 */
export function append(out: Matrix4x4, source: Readonly<Matrix4x4>, other: Readonly<Matrix4x4>): void {
  // world-space append
  multiply(out, source, other);
}

/**
 * Applies a world-space rotation to the current matrix.
 *
 * Rotation is applied after all transformations of source are completed.
 **/
export function appendRotation(
  out: Matrix4x4,
  source: Readonly<Matrix4x4>,
  degrees: number,
  axis: Readonly<Vector4>,
  pivotPoint?: Readonly<Vector4>,
): void {
  const m = matrix4x4Pool.getIdentity();
  __getAxisRotation(m, axis.x, axis.y, axis.z, degrees);

  if (pivotPoint !== undefined) {
    const p = pivotPoint;
    const t1 = matrix4x4Pool.getIdentity();
    const t2 = matrix4x4Pool.getIdentity();

    appendTranslation(t1, t1, -p.x, -p.y, -p.z);
    appendTranslation(t2, t2, p.x, p.y, p.z);

    multiply(m, t1, m); // R · T(-p)
    multiply(m, m, t2); // T(p) · (R · T(-p))

    matrix4x4Pool.release(t1);
    matrix4x4Pool.release(t2);
  }

  append(out, source, m);

  matrix4x4Pool.release(m);
}

/**
 * Applies a world-space scale value to the source matrix.
 *
 * Scale is applied after all transformations of source are completed.
 **/
export function appendScale(
  out: Matrix4x4,
  source: Readonly<Matrix4x4>,
  xScale: number,
  yScale: number,
  zScale: number,
): void {
  const m = matrix4x4Pool.get();
  setTo(m, xScale, 0.0, 0.0, 0.0, 0.0, yScale, 0.0, 0.0, 0.0, 0.0, zScale, 0.0, 0.0, 0.0, 0.0, 1.0);
  append(out, source, m);
  matrix4x4Pool.release(m);
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
export function appendTranslation(out: Matrix4x4, source: Readonly<Matrix4x4>, x: number, y: number, z: number): void {
  const _out = out.m;
  const _source = source.m;
  if (out !== source) out.m.set(source.m);
  _out[12] = _source[12] + x;
  _out[13] = _source[13] + y;
  _out[14] = _source[14] + z;
}

export function clone(source: Readonly<Matrix4x4>): Matrix4x4 {
  const m = create();
  copy(m, source);
  return m;
}

export function copy(out: Matrix4x4, source: Readonly<Matrix4x4>): void {
  out.m.set(source.m);
}

/**
  Copies a column of data from a `Vector4` instance into the values of the target matrix
**/
export function copyColumnFrom(out: Matrix4x4, column: number, source: Readonly<Vector4>): void {
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
 * Copies a column of data from the source matrix into a `Vector4` instance
 **/
export function copyColumnTo(out: Vector4, column: number, source: Readonly<Matrix4x4>): void {
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
 * Copies a row of data from a `Vector4` instance into the values of the out matrix
 **/
export function copyRowFrom(out: Matrix4x4, row: number, source: Readonly<Vector4>): void {
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
 * Copies a row of data from the source matrix into a `Vector4` instance
 **/
export function copyRowTo(out: Vector4, row: number, source: Readonly<Matrix4x4>): void {
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
 * Creates a matrix using two-dimensional transform values
 **/
export function create2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): Matrix4x4 {
  const out = create();
  set2D(out, a, b, c, d, tx, ty);
  return out;
}

/**
 * Initializes this matrix with values for an orthographic projection, useful in rendering
 **/
export function createOrtho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  zNear: number,
  zFar: number,
): Matrix4x4 {
  const out = create();
  setOrtho(out, left, right, bottom, top, zNear, zFar);
  return out;
}

/**
 * Initializes this matrix with values for a perspective projection
 **/
export function createPerspective(fov: number, aspect: number, zNear: number, zFar: number): Matrix4x4 {
  const out = create();
  setPerspective(out, fov, aspect, zNear, zFar);
  return out;
}

export function determinant(source: Readonly<Matrix4x4>): number {
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

export function equals(a: Readonly<Matrix4x4> | null | undefined, b: Readonly<Matrix4x4> | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (let i = 0; i < 16; i++) {
    if (a.m[i] !== b.m[i]) return false;
  }
  return true;
}

export function fromMatrix3x2(out: Matrix4x4, source: Readonly<Matrix3x2>): void {
  set2D(out, source.a, source.b, source.c, source.d, source.tx, source.ty);
}

export function fromMatrix3x3(out: Matrix4x4, source: Readonly<Matrix3x3>): void {
  const _out = out.m;
  const _source = source.m;
  set2D(out, _source[0], _source[1], _source[3], _source[4], _source[2], _source[5]);
  _out[2] = _source[6];
  _out[6] = _source[7];
  _out[10] = _source[8];
}

export function get(source: Readonly<Matrix4x4>, row: number, column: number): number {
  return source.m[column * 4 + row];
}

export function isAffine(source: Readonly<Matrix4x4>): boolean {
  const _source = source.m;
  return _source[3] === 0 && _source[7] === 0 && _source[11] === 0 && _source[15] === 1;
}

/**
 * Resets the current matrix using default identity values
 **/
export function identity(out: Matrix4x4): void {
  setTo(out, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/**
 * Interpolates from one `Matrix4x4` instance to another, given a percentage between the two
 **/
export function interpolate(out: Matrix4x4, a: Readonly<Matrix4x4>, b: Readonly<Matrix4x4>, t: number): void {
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
export function inverse(out: Matrix4x4, source: Readonly<Matrix4x4>): boolean {
  const _out = out.m;
  const _source = source.m;

  // Calculate determinant
  let d = determinant(source);

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

/**
 * Matrix multiplication
 *
 * out = a * b
 **/
export function multiply(out: Matrix4x4, a: Readonly<Matrix4x4>, b: Readonly<Matrix4x4>): void {
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
  Sets the matrix values as a transformation orientated toward a certain vector position
**/
// export function pointAt(out: Matrix4x4, pos: Vector4, at?: Vector4, up?: Vector4): void {
//   const _out = out.m;
//   // TODO: This implementation is broken

//   if (at === undefined) {
//     at = new Vector4(0, 0, 1);
//   }

//   if (up === undefined) {
//     up = new Vector4(0, 1, 0);
//   }

//   const dir = pos.subtract(at);
//   const vup = up.clone();
//   const right: Vector4;

//   dir.normalize();
//   vup.normalize();

//   const dir2 = dir.clone();
//   dir2.scaleBy(vup.dotProduct(dir));

//   vup = vup.subtract(dir2);

//   if (vup.length > 0) {
//     vup.normalize();
//   } else {
//     if (dir.x != 0) {
//       vup = new Vector4(-dir.y, dir.x, 0);
//     } else {
//       vup = new Vector4(1, 0, 0);
//     }
//   }

//   right = vup.crossProduct(dir);
//   right.normalize();

//   _out[0] = right.x;
//   _out[4] = right.y;
//   _out[8] = right.z;
//   _out[12] = 0.0;
//   _out[1] = vup.x;
//   _out[5] = vup.y;
//   _out[9] = vup.z;
//   _out[13] = 0.0;
//   _out[2] = dir.x;
//   _out[6] = dir.y;
//   _out[10] = dir.z;
//   _out[14] = 0.0;
//   _out[3] = pos.x;
//   _out[7] = pos.y;
//   _out[11] = pos.z;
//   _out[15] = 1.0;
// }

export function position(out: Vector3, source: Readonly<Matrix4x4>): void {
  const _source = source.m;
  out.x = _source[12];
  out.y = _source[13];
  out.z = _source[14];
}

/**
 * Prepends a matrix in world space (pre-multiply).
 *
 * out = other · source
 */
export function prepend(out: Matrix4x4, source: Readonly<Matrix4x4>, other: Readonly<Matrix4x4>): void {
  multiply(out, other, source);
}

/**
 * Prepends rotation before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 **/
export function prependRotation(
  out: Matrix4x4,
  source: Readonly<Matrix4x4>,
  degrees: number,
  axis: Readonly<Vector4>,
  pivotPoint?: Readonly<Vector4>,
): void {
  const m = matrix4x4Pool.getIdentity();
  __getAxisRotation(m, axis.x, axis.y, axis.z, degrees);

  if (pivotPoint !== undefined) {
    const p = pivotPoint;
    const t1 = matrix4x4Pool.getIdentity();
    const t2 = matrix4x4Pool.getIdentity();

    appendTranslation(t1, t1, -p.x, -p.y, -p.z);
    appendTranslation(t2, t2, p.x, p.y, p.z);

    multiply(m, m, t1); // R · T(-p)
    multiply(m, t2, m); // T(p) · (R · T(-p))

    matrix4x4Pool.release(t1);
    matrix4x4Pool.release(t2);
  }

  prepend(out, source, m);

  matrix4x4Pool.release(m);
}

/**
 * Prepends scale before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 **/
export function prependScale(
  out: Matrix4x4,
  source: Readonly<Matrix4x4>,
  xScale: number,
  yScale: number,
  zScale: number,
): void {
  const m = matrix4x4Pool.get();
  setTo(m, xScale, 0.0, 0.0, 0.0, 0.0, yScale, 0.0, 0.0, 0.0, 0.0, zScale, 0.0, 0.0, 0.0, 0.0, 1.0);
  prepend(out, source, m);
  matrix4x4Pool.release(m);
}

/**
 * Prepends a translation before all local-space transforms.
 *
 * This method first applies the translation (tx, ty, tz) and then applies all the transformations
 * (e.g., rotation, scaling, etc.) from the source matrix.
 */
export function prependTranslation(out: Matrix4x4, source: Readonly<Matrix4x4>, x: number, y: number, z: number): void {
  const m = matrix4x4Pool.getIdentity();
  translate(m, m, x, y, z); // LOCAL translation matrix
  multiply(out, m, source);
  matrix4x4Pool.release(m);
}

/**
 * Applies a local-space rotation relative to the matrix’s existing orientation.
 *
 * Translation is preserved.
 */
export function rotate(out: Matrix4x4, source: Readonly<Matrix4x4>, axis: Readonly<Vector3>, degrees: number): void {
  const m = matrix4x4Pool.getIdentity();
  __getAxisRotation(m, axis.x, axis.y, axis.z, degrees);
  multiply(out, source, m);
  matrix4x4Pool.release(m);
}

/**
 * Applies a local-space scale relative to the matrix’s existing orientation.
 *
 * Translation is preserved.
 */
export function scale(out: Matrix4x4, source: Readonly<Matrix4x4>, sx: number, sy: number, sz: number): void {
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

export function set(out: Matrix4x4, row: number, column: number, value: number): void {
  out.m[column * 4 + row] = value;
}

/**
 * Resets the current matrix using two-dimensional transform values
 **/
export function set2D(out: Matrix4x4, a: number, b: number, c: number, d: number, tx?: number, ty?: number): void {
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
 * Initializes a matrix with values for an orthographic projection, useful in rendering
 **/
export function setOrtho(
  out: Matrix4x4,
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
export function setPerspective(out: Matrix4x4, fov: number, aspect: number, zNear: number, zFar: number): void {
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
  _out[10] = -(zFar + zNear) / (zFar - zNear);
  _out[11] = -1.0;

  _out[12] = 0;
  _out[13] = 0;
  _out[14] = (-2 * zFar * zNear) / (zFar - zNear);
  _out[15] = 1;
}

export function setPosition(out: Matrix4x4, source: Readonly<Vector3>): void {
  const _out = out.m;
  _out[12] = source.x;
  _out[13] = source.y;
  _out[14] = source.z;
}

export function setTo(
  out: Matrix4x4,
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

/**
 * Transforms a point using this matrix, ignoring the translation of the matrix
 **/
export function transformPoint(out: Vector3, source: Readonly<Matrix4x4>, point: Readonly<Vector3>): void {
  const _source = source.m;
  const x = point.x,
    y = point.y,
    z = point.z;
  out.x = x * _source[0] + y * _source[4] + z * _source[8] + _source[12];
  out.y = x * _source[1] + y * _source[5] + z * _source[9] + _source[13];
  out.z = x * _source[2] + y * _source[6] + z * _source[10] + _source[14];
}

/**
  Transforms a `Vector4` instance using the current matrix
  @param	result	(Optional) An existing `Vector2` instance to fill with the result
  @return	The resulting `Vector4` instance
**/
export function transformVector(out: Vector4, source: Readonly<Matrix4x4>, vector: Readonly<Vector4>): void {
  const _source = source.m;
  const x = vector.x,
    y = vector.y,
    z = vector.z;
  out.x = x * _source[0] + y * _source[4] + z * _source[8] + _source[12];
  out.y = x * _source[1] + y * _source[5] + z * _source[9] + _source[13];
  out.z = x * _source[2] + y * _source[6] + z * _source[10] + _source[14];
  out.w = x * _source[3] + y * _source[7] + z * _source[11] + _source[15];
}

/**
 * Transforms a series of [x, y, z] value pairs at once
 **/
export function transformVectors(
  out: Float32Array,
  source: Readonly<Matrix4x4>,
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
 * Applies a local-space translation to the matrix, taking into account the source matrix's rotation and scale.
 *
 * Translation is applied respecting using all other transformations of source.
 */
export function translate(out: Matrix4x4, source: Readonly<Matrix4x4>, tx: number, ty: number, tz: number): void {
  const a = source.m;
  const o = out.m;
  if (out !== source) out.m.set(source.m);
  o[12] = a[0] * tx + a[4] * ty + a[8] * tz + a[12];
  o[13] = a[1] * tx + a[5] * ty + a[9] * tz + a[13];
  o[14] = a[2] * tx + a[6] * ty + a[10] * tz + a[14];
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
export function transpose(out: Matrix4x4, source: Readonly<Matrix4x4>): void {
  if (out !== source) out.m.set(source.m);
  __swap(out, source, 1, 4);
  __swap(out, source, 2, 8);
  __swap(out, source, 3, 12);
  __swap(out, source, 6, 9);
  __swap(out, source, 7, 13);
  __swap(out, source, 11, 14);
}

function __getAxisRotation(out: Matrix4x4, x: number, y: number, z: number, degrees: number): void {
  const _out = out.m;
  let ax = x,
    ay = y,
    az = z;

  const DEG_TO_RAD = Math.PI / 180;
  const rad = -degrees * DEG_TO_RAD;
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

function __swap(out: Matrix4x4, source: Readonly<Matrix4x4>, a: number, b: number): void {
  const temp = source.m[a];
  out.m[a] = source.m[b];
  out.m[b] = temp;
}

const __identity: Float32Array = new Float32Array([
  1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
]);
