import { createEntity } from '@flighthq/entity';
import type { Matrix3, Matrix3Like, Matrix4Like, MatrixLike, Vector3Like } from '@flighthq/types';

import { acquireMatrix3, releaseMatrix3 } from './matrix3Pool';

export function cloneMatrix3(source: Readonly<Matrix3Like>): Matrix3 {
  const m = createMatrix3();
  copyMatrix3(m, source);
  return m;
}

export function copyMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>): void {
  out.m.set(source.m);
}

export function copyMatrix3ColumnFromVector3(out: Matrix3Like, column: number, source: Readonly<Vector3Like>): void {
  if (column > 2) {
    throw new RangeError('Column ' + column + ' out of bounds (2)');
  } else if (column === 0) {
    out.m[0] = source.x;
    out.m[3] = source.y;
    out.m[6] = source.z;
  } else if (column === 1) {
    out.m[1] = source.x;
    out.m[4] = source.y;
    out.m[7] = source.z;
  } else {
    out.m[2] = source.x;
    out.m[5] = source.y;
    out.m[8] = source.z;
  }
}

export function copyMatrix3ColumnToVector3(out: Vector3Like, column: number, source: Readonly<Matrix3Like>): void {
  if (column > 2) {
    throw new RangeError('Column ' + column + ' out of bounds (2)');
  } else if (column === 0) {
    out.x = source.m[0];
    out.y = source.m[3];
    out.z = source.m[6];
  } else if (column === 1) {
    out.x = source.m[1];
    out.y = source.m[4];
    out.z = source.m[7];
  } else {
    out.x = source.m[2];
    out.y = source.m[5];
    out.z = source.m[8];
  }
}

export function copyMatrix3RowFromVector3(out: Matrix3Like, row: number, source: Readonly<Vector3Like>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  } else if (row === 0) {
    out.m[0] = source.x;
    out.m[1] = source.y;
    out.m[2] = source.z;
  } else if (row === 1) {
    out.m[3] = source.x;
    out.m[4] = source.y;
    out.m[5] = source.z;
  } else {
    out.m[6] = source.x;
    out.m[7] = source.y;
    out.m[8] = source.z;
  }
}

export function copyMatrix3RowToVector3(out: Vector3Like, row: number, source: Readonly<Matrix3Like>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  } else if (row === 0) {
    out.x = source.m[0];
    out.y = source.m[1];
    out.z = source.m[2];
  } else if (row === 1) {
    out.x = source.m[3];
    out.y = source.m[4];
    out.z = source.m[5];
  } else {
    out.x = source.m[6];
    out.y = source.m[7];
    out.z = source.m[8];
  }
}

/**
 * A 3×3 homogeneous matrix.
 *
 * [ m00 m01 m02 ]
 * [ m10 m11 m12 ]
 * [ m20 m21 m22 ]
 *
 * Storage is row-major.
 */
export function createMatrix3(
  m00?: number,
  m01?: number,
  m02?: number,
  m10?: number,
  m11?: number,
  m12?: number,
  m20?: number,
  m21?: number,
  m22?: number,
): Matrix3 {
  const m = new Float32Array(__identity);
  const out: Matrix3 = createEntity({ m: m });
  if (m00 !== undefined) m[0] = m00;
  if (m01 !== undefined) m[1] = m01;
  if (m02 !== undefined) m[2] = m02;
  if (m10 !== undefined) m[3] = m10;
  if (m11 !== undefined) m[4] = m11;
  if (m12 !== undefined) m[5] = m12;
  if (m20 !== undefined) m[6] = m20;
  if (m21 !== undefined) m[7] = m21;
  if (m22 !== undefined) m[8] = m22;
  return out;
}

export function equalsMatrix3(
  a: Readonly<Matrix3Like> | null | undefined,
  b: Readonly<Matrix3Like> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (let i = 0; i < 9; i++) {
    if (a.m[i] !== b.m[i]) return false;
  }
  return true;
}

/**
 * Returns the determinant of a 3×3 matrix.
 */
export function getMatrix3Determinant(source: Readonly<Matrix3Like>): number {
  const m = source.m;
  return (
    m[0] * m[4] * m[8] +
    m[1] * m[5] * m[6] +
    m[2] * m[3] * m[7] -
    m[2] * m[4] * m[6] -
    m[1] * m[3] * m[8] -
    m[0] * m[5] * m[7]
  );
}

export function getMatrix3Element(source: Readonly<Matrix3Like>, row: number, column: number): number {
  return source.m[row * 3 + column];
}

/**
 * Attempts to invert a 3×3 matrix, writing the result to `out`. Returns `true` on success.
 * When the matrix is singular (determinant zero, non-invertible) — an expected failure — fills
 * `out` with NaN and returns `false` as the documented sentinel, mirroring `inverseMatrix4`.
 */
export function inverseMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>): boolean {
  const _out = out.m;
  const _in = source.m;
  const m0 = _in[0];
  const m1 = _in[1];
  const m2 = _in[2];
  const m3 = _in[3];
  const m4 = _in[4];
  const m5 = _in[5];
  const m6 = _in[6];
  const m7 = _in[7];
  const m8 = _in[8];

  if (isAffineMatrix3(source)) {
    // Affine fast path
    const det = m0 * m4 - m1 * m3;

    if (det === 0) {
      _out.fill(NaN);
      return false;
    }

    const invDet = 1 / det;

    const out0 = m4 * invDet;
    const out1 = -m1 * invDet;
    const out3 = -m3 * invDet;
    const out4 = m0 * invDet;

    _out[0] = out0;
    _out[1] = out1;
    _out[2] = -(out0 * m2 + out3 * m5);
    _out[3] = out3;
    _out[4] = out4;
    _out[5] = -(out1 * m2 + out4 * m5);

    _out[6] = 0;
    _out[7] = 0;
    _out[8] = 1;
    return true;
  }

  const det = m0 * m4 * m8 + m1 * m5 * m6 + m2 * m3 * m7 - m2 * m4 * m6 - m1 * m3 * m8 - m0 * m5 * m7;

  if (det === 0) {
    _out.fill(NaN);
    return false;
  }

  const inv = 1 / det;

  _out[0] = (m4 * m8 - m5 * m7) * inv;
  _out[1] = (m2 * m7 - m1 * m8) * inv;
  _out[2] = (m1 * m5 - m2 * m4) * inv;

  _out[3] = (m5 * m6 - m3 * m8) * inv;
  _out[4] = (m0 * m8 - m2 * m6) * inv;
  _out[5] = (m2 * m3 - m0 * m5) * inv;

  _out[6] = (m3 * m7 - m4 * m6) * inv;
  _out[7] = (m1 * m6 - m0 * m7) * inv;
  _out[8] = (m0 * m4 - m1 * m3) * inv;
  return true;
}

export function isAffineMatrix3(source: Readonly<Matrix3Like>): boolean {
  return source.m[6] === 0 && source.m[7] === 0 && source.m[8] === 1;
}

/**
 * out = a * b
 */
export function multiplyMatrix3(out: Matrix3Like, a: Readonly<Matrix3Like>, b: Readonly<Matrix3Like>): void {
  const _a = a.m;
  const _b = b.m;
  const _out = out.m;

  if (isAffineMatrix3(a) && isAffineMatrix3(b)) {
    const a0 = _a[0];
    const a1 = _a[1];
    const a2 = _a[2];
    const a3 = _a[3];
    const a4 = _a[4];
    const a5 = _a[5];
    const b0 = _b[0];
    const b1 = _b[1];
    const b2 = _b[2];
    const b3 = _b[3];
    const b4 = _b[4];
    const b5 = _b[5];

    _out[0] = a0 * b0 + a1 * b3;
    _out[1] = a0 * b1 + a1 * b4;
    _out[2] = a0 * b2 + a1 * b5 + a2;

    _out[3] = a3 * b0 + a4 * b3;
    _out[4] = a3 * b1 + a4 * b4;
    _out[5] = a3 * b2 + a4 * b5 + a5;

    _out[6] = 0;
    _out[7] = 0;
    _out[8] = 1;
    return;
  }

  // First row of a * columns of b
  const m00 = _a[0] * _b[0] + _a[1] * _b[3] + _a[2] * _b[6];
  const m01 = _a[0] * _b[1] + _a[1] * _b[4] + _a[2] * _b[7];
  const m02 = _a[0] * _b[2] + _a[1] * _b[5] + _a[2] * _b[8];

  // Second row of a * columns of b
  const m10 = _a[3] * _b[0] + _a[4] * _b[3] + _a[5] * _b[6];
  const m11 = _a[3] * _b[1] + _a[4] * _b[4] + _a[5] * _b[7];
  const m12 = _a[3] * _b[2] + _a[4] * _b[5] + _a[5] * _b[8];

  // Third row of a * columns of b
  const m20 = _a[6] * _b[0] + _a[7] * _b[3] + _a[8] * _b[6];
  const m21 = _a[6] * _b[1] + _a[7] * _b[4] + _a[8] * _b[7];
  const m22 = _a[6] * _b[2] + _a[7] * _b[5] + _a[8] * _b[8];

  // Assign the result to the output matrix
  _out[0] = m00;
  _out[1] = m01;
  _out[2] = m02;
  _out[3] = m10;
  _out[4] = m11;
  _out[5] = m12;
  _out[6] = m20;
  _out[7] = m21;
  _out[8] = m22;
}

export function rotateMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>, theta: number): void {
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  const a = source.m;
  const o = out.m;

  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const a6 = a[6];
  const a7 = a[7];
  const a8 = a[8];

  o[0] = a0 * c + a1 * s;
  o[1] = a0 * -s + a1 * c;
  o[2] = a2;

  o[3] = a3 * c + a4 * s;
  o[4] = a3 * -s + a4 * c;
  o[5] = a5;

  o[6] = a6 * c + a7 * s;
  o[7] = a6 * -s + a7 * c;
  o[8] = a8;
}

export function scaleMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>, sx: number, sy: number): void {
  const a = source.m;
  const o = out.m;

  o[0] = a[0] * sx;
  o[1] = a[1] * sy;
  o[2] = a[2];

  o[3] = a[3] * sx;
  o[4] = a[4] * sy;
  o[5] = a[5];

  o[6] = a[6] * sx;
  o[7] = a[7] * sy;
  o[8] = a[8];
}

export function setMatrix3(
  out: Matrix3Like,
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number,
): void {
  const _out = out.m;
  _out[0] = m00;
  _out[1] = m01;
  _out[2] = m02;
  _out[3] = m10;
  _out[4] = m11;
  _out[5] = m12;
  _out[6] = m20;
  _out[7] = m21;
  _out[8] = m22;
}

export function setMatrix3Element(out: Matrix3Like, row: number, column: number, value: number): void {
  out.m[row * 3 + column] = value;
}

/**
 * Reads a Matrix3 from a Float32Array at a byte offset (row-major, 9 floats).
 */
export function setMatrix3FromFloat32Array(out: Matrix3Like, offset: number, source: Readonly<Float32Array>): void {
  const m = out.m;
  for (let i = 0; i < 9; i++) {
    m[i] = source[offset + i];
  }
}

export function setMatrix3FromMatrix(out: Matrix3Like, source: Readonly<MatrixLike>): void {
  const _out = out.m;
  _out[0] = source.a;
  _out[1] = source.b;
  _out[2] = source.tx;
  _out[3] = source.c;
  _out[4] = source.d;
  _out[5] = source.ty;
  _out[6] = 0;
  _out[7] = 0;
  _out[8] = 1;
}

export function setMatrix3FromMatrix4(out: Matrix3Like, source: Readonly<Matrix4Like>): void {
  const _out = out.m;
  const _source = source.m;
  _out[0] = _source[0];
  _out[1] = _source[4];
  _out[2] = _source[8];

  _out[3] = _source[1];
  _out[4] = _source[5];
  _out[5] = _source[9];

  _out[6] = _source[2];
  _out[7] = _source[6];
  _out[8] = _source[10];
}

export function setMatrix3Identity(out: Matrix3Like): void {
  out.m.set(__identity);
}

/**
 * Writes the normal matrix for a Matrix4 model transform: the inverse-transpose of its
 * upper-left 3×3. Transforming normals by this (instead of the model matrix) keeps them
 * perpendicular to surfaces under non-uniform scale and shear.
 *
 * Reads the source through a scratch matrix before writing, so it is safe regardless of how
 * `out` relates to `source`.
 */
export function setMatrix3NormalFromMatrix4(out: Matrix3Like, source: Readonly<Matrix4Like>): void {
  const scratch = acquireMatrix3();
  setMatrix3FromMatrix4(scratch, source);
  inverseMatrix3(scratch, scratch);
  transposeMatrix3(out, scratch);
  releaseMatrix3(scratch);
}

export function translateMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>, tx: number, ty: number): void {
  const a = source.m;
  const o = out.m;

  o[0] = a[0];
  o[1] = a[1];
  o[2] = a[0] * tx + a[1] * ty + a[2];

  o[3] = a[3];
  o[4] = a[4];
  o[5] = a[3] * tx + a[4] * ty + a[5];

  o[6] = a[6];
  o[7] = a[7];
  o[8] = a[6] * tx + a[7] * ty + a[8];
}

/**
 * Transposes a 3×3 matrix (swaps rows and columns). Reads each off-diagonal pair into a
 * temporary before writing, so it is safe when `out` aliases `source`.
 */
export function transposeMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>): void {
  const s = source.m;
  const m1 = s[1],
    m2 = s[2],
    m3 = s[3],
    m5 = s[5],
    m6 = s[6],
    m7 = s[7];

  const o = out.m;
  o[0] = s[0];
  o[1] = m3;
  o[2] = m6;
  o[3] = m1;
  o[4] = s[4];
  o[5] = m7;
  o[6] = m2;
  o[7] = m5;
  o[8] = s[8];
}

/**
 * Writes a Matrix3 into a Float32Array at a byte offset (row-major, 9 floats).
 */
export function writeMatrix3ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Matrix3Like>): void {
  const m = source.m;
  for (let i = 0; i < 9; i++) {
    out[offset + i] = m[i];
  }
}

const __identity: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
