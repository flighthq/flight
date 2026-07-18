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
  }
  // Column-major: a column's three elements are contiguous at 3*column + row.
  const base = column * 3;
  out.m[base] = source.x;
  out.m[base + 1] = source.y;
  out.m[base + 2] = source.z;
}

export function copyMatrix3ColumnToVector3(out: Vector3Like, column: number, source: Readonly<Matrix3Like>): void {
  if (column > 2) {
    throw new RangeError('Column ' + column + ' out of bounds (2)');
  }
  const base = column * 3;
  out.x = source.m[base];
  out.y = source.m[base + 1];
  out.z = source.m[base + 2];
}

export function copyMatrix3RowFromVector3(out: Matrix3Like, row: number, source: Readonly<Vector3Like>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  }
  // Column-major: a row's three elements are strided by 3 at 3*column + row.
  out.m[row] = source.x;
  out.m[row + 3] = source.y;
  out.m[row + 6] = source.z;
}

export function copyMatrix3RowToVector3(out: Vector3Like, row: number, source: Readonly<Matrix3Like>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  }
  out.x = source.m[row];
  out.y = source.m[row + 3];
  out.z = source.m[row + 6];
}

/**
 * A 3×3 homogeneous matrix.
 *
 * [ m00 m01 m02 ]
 * [ m10 m11 m12 ]
 * [ m20 m21 m22 ]
 *
 * Storage is column-major: element (row r, column c) lives at m[3 * c + r]. This matches Matrix4 and
 * the GL/GLSL/WGSL uniform ABI, so a Matrix3 uploads through `uniformMatrix3fv(loc, false, m)` with no
 * transpose. The constructor still takes its nine arguments in reading (row-major) order.
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
  if (m01 !== undefined) m[3] = m01;
  if (m02 !== undefined) m[6] = m02;
  if (m10 !== undefined) m[1] = m10;
  if (m11 !== undefined) m[4] = m11;
  if (m12 !== undefined) m[7] = m12;
  if (m20 !== undefined) m[2] = m20;
  if (m21 !== undefined) m[5] = m21;
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
 * Returns the determinant of a 3×3 matrix. The determinant is transpose-invariant, so this flat-index
 * form is independent of row/column-major storage.
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
  return source.m[column * 3 + row];
}

/**
 * Attempts to invert a 3×3 matrix, writing the result to `out`. Returns `true` on success.
 * When the matrix is singular (determinant zero, non-invertible) — an expected failure — fills
 * `out` with NaN and returns `false` as the documented sentinel, mirroring `inverseMatrix4`.
 */
export function inverseMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>): boolean {
  const _out = out.m;
  const _in = source.m;
  // Column-major element reads: a<row><col> = _in[3 * col + row].
  const a00 = _in[0];
  const a10 = _in[1];
  const a20 = _in[2];
  const a01 = _in[3];
  const a11 = _in[4];
  const a21 = _in[5];
  const a02 = _in[6];
  const a12 = _in[7];
  const a22 = _in[8];

  if (isAffineMatrix3(source)) {
    // Affine fast path: invert the 2×2 linear part, then map the translation column through it.
    const det = a00 * a11 - a01 * a10;

    if (det === 0) {
      _out.fill(NaN);
      return false;
    }

    const invDet = 1 / det;
    const i00 = a11 * invDet;
    const i01 = -a01 * invDet;
    const i10 = -a10 * invDet;
    const i11 = a00 * invDet;

    _out[0] = i00;
    _out[1] = i10;
    _out[2] = 0;
    _out[3] = i01;
    _out[4] = i11;
    _out[5] = 0;
    _out[6] = -(i00 * a02 + i01 * a12);
    _out[7] = -(i10 * a02 + i11 * a12);
    _out[8] = 1;
    return true;
  }

  const det = a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);

  if (det === 0) {
    _out.fill(NaN);
    return false;
  }

  const inv = 1 / det;

  _out[0] = (a11 * a22 - a12 * a21) * inv;
  _out[1] = (a12 * a20 - a10 * a22) * inv;
  _out[2] = (a10 * a21 - a11 * a20) * inv;

  _out[3] = (a02 * a21 - a01 * a22) * inv;
  _out[4] = (a00 * a22 - a02 * a20) * inv;
  _out[5] = (a01 * a20 - a00 * a21) * inv;

  _out[6] = (a01 * a12 - a02 * a11) * inv;
  _out[7] = (a02 * a10 - a00 * a12) * inv;
  _out[8] = (a00 * a11 - a01 * a10) * inv;
  return true;
}

export function isAffineMatrix3(source: Readonly<Matrix3Like>): boolean {
  // Bottom row (2,0),(2,1),(2,2) is column-major m[2], m[5], m[8].
  return source.m[2] === 0 && source.m[5] === 0 && source.m[8] === 1;
}

/**
 * out = a * b
 */
export function multiplyMatrix3(out: Matrix3Like, a: Readonly<Matrix3Like>, b: Readonly<Matrix3Like>): void {
  const _a = a.m;
  const _b = b.m;
  const _out = out.m;

  // Column-major element reads: <name><row><col> = _<name>[3 * col + row].
  const a00 = _a[0];
  const a10 = _a[1];
  const a20 = _a[2];
  const a01 = _a[3];
  const a11 = _a[4];
  const a21 = _a[5];
  const a02 = _a[6];
  const a12 = _a[7];
  const a22 = _a[8];

  const b00 = _b[0];
  const b10 = _b[1];
  const b20 = _b[2];
  const b01 = _b[3];
  const b11 = _b[4];
  const b21 = _b[5];
  const b02 = _b[6];
  const b12 = _b[7];
  const b22 = _b[8];

  if (isAffineMatrix3(a) && isAffineMatrix3(b)) {
    _out[0] = a00 * b00 + a01 * b10;
    _out[1] = a10 * b00 + a11 * b10;
    _out[2] = 0;
    _out[3] = a00 * b01 + a01 * b11;
    _out[4] = a10 * b01 + a11 * b11;
    _out[5] = 0;
    _out[6] = a00 * b02 + a01 * b12 + a02;
    _out[7] = a10 * b02 + a11 * b12 + a12;
    _out[8] = 1;
    return;
  }

  _out[0] = a00 * b00 + a01 * b10 + a02 * b20;
  _out[1] = a10 * b00 + a11 * b10 + a12 * b20;
  _out[2] = a20 * b00 + a21 * b10 + a22 * b20;

  _out[3] = a00 * b01 + a01 * b11 + a02 * b21;
  _out[4] = a10 * b01 + a11 * b11 + a12 * b21;
  _out[5] = a20 * b01 + a21 * b11 + a22 * b21;

  _out[6] = a00 * b02 + a01 * b12 + a02 * b22;
  _out[7] = a10 * b02 + a11 * b12 + a12 * b22;
  _out[8] = a20 * b02 + a21 * b12 + a22 * b22;
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

  // Post-multiply by the (0,1)-plane rotation: new column 0 = col0·c + col1·s, column 1 = -col0·s + col1·c.
  o[0] = a0 * c + a3 * s;
  o[1] = a1 * c + a4 * s;
  o[2] = a2 * c + a5 * s;

  o[3] = a0 * -s + a3 * c;
  o[4] = a1 * -s + a4 * c;
  o[5] = a2 * -s + a5 * c;

  o[6] = a6;
  o[7] = a7;
  o[8] = a8;
}

export function scaleMatrix3(out: Matrix3Like, source: Readonly<Matrix3Like>, sx: number, sy: number): void {
  const a = source.m;
  const o = out.m;

  // Post-multiply by diag(sx, sy, 1): scale column 0 by sx, column 1 by sy, leave the translation column.
  o[0] = a[0] * sx;
  o[1] = a[1] * sx;
  o[2] = a[2] * sx;

  o[3] = a[3] * sy;
  o[4] = a[4] * sy;
  o[5] = a[5] * sy;

  o[6] = a[6];
  o[7] = a[7];
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
  // Arguments are in reading (row-major) order; stored column-major at 3 * col + row.
  _out[0] = m00;
  _out[3] = m01;
  _out[6] = m02;
  _out[1] = m10;
  _out[4] = m11;
  _out[7] = m12;
  _out[2] = m20;
  _out[5] = m21;
  _out[8] = m22;
}

export function setMatrix3Element(out: Matrix3Like, row: number, column: number, value: number): void {
  out.m[column * 3 + row] = value;
}

/**
 * Reads a Matrix3 from a Float32Array at a byte offset (column-major, 9 floats).
 */
export function setMatrix3FromFloat32Array(out: Matrix3Like, offset: number, source: Readonly<Float32Array>): void {
  const m = out.m;
  for (let i = 0; i < 9; i++) {
    m[i] = source[offset + i];
  }
}

export function setMatrix3FromMatrix(out: Matrix3Like, source: Readonly<MatrixLike>): void {
  const _out = out.m;
  // The 2D affine [[a,b,tx],[c,d,ty],[0,0,1]] embeds column-major.
  _out[0] = source.a;
  _out[1] = source.c;
  _out[2] = 0;
  _out[3] = source.b;
  _out[4] = source.d;
  _out[5] = 0;
  _out[6] = source.tx;
  _out[7] = source.ty;
  _out[8] = 1;
}

export function setMatrix3FromMatrix4(out: Matrix3Like, source: Readonly<Matrix4Like>): void {
  const _out = out.m;
  const _source = source.m;
  // Both column-major: copy the upper-left 3×3 straight through, dropping Matrix4's 4th row/column.
  _out[0] = _source[0];
  _out[1] = _source[1];
  _out[2] = _source[2];

  _out[3] = _source[4];
  _out[4] = _source[5];
  _out[5] = _source[6];

  _out[6] = _source[8];
  _out[7] = _source[9];
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

  // Post-multiply by translate(tx, ty): columns 0 and 1 pass through; the translation column becomes
  // col0·tx + col1·ty + col2.
  o[0] = a[0];
  o[1] = a[1];
  o[2] = a[2];

  o[3] = a[3];
  o[4] = a[4];
  o[5] = a[5];

  o[6] = a[0] * tx + a[3] * ty + a[6];
  o[7] = a[1] * tx + a[4] * ty + a[7];
  o[8] = a[2] * tx + a[5] * ty + a[8];
}

/**
 * Transposes a 3×3 matrix (swaps rows and columns). Reads each off-diagonal pair into a
 * temporary before writing, so it is safe when `out` aliases `source`. The swapped index pairs
 * (1↔3, 2↔6, 5↔7) are the same in row- or column-major storage.
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
 * Writes a Matrix3 into a Float32Array at a byte offset (column-major, 9 floats).
 */
export function writeMatrix3ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Matrix3Like>): void {
  const m = source.m;
  for (let i = 0; i < 9; i++) {
    out[offset + i] = m[i];
  }
}

const __identity: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
