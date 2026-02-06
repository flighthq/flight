import type { Matrix3 as Matrix3Like, Vector3 as Vector3Like } from '@flighthq/types';

/**
 * A 3×3 homogeneous matrix.
 *
 * [ m00 m01 m02 ]
 * [ m10 m11 m12 ]
 * [ m20 m21 m22 ]
 */
export default class Matrix3 implements Matrix3Like {
  private static __identity: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  readonly m: Float32Array = new Float32Array(Matrix3.__identity);

  constructor(
    m00?: number,
    m01?: number,
    m02?: number,
    m10?: number,
    m11?: number,
    m12?: number,
    m20?: number,
    m21?: number,
    m22?: number,
  ) {
    if (m00 !== undefined) this.m[0] = m00;
    if (m01 !== undefined) this.m[1] = m01;
    if (m02 !== undefined) this.m[2] = m02;
    if (m10 !== undefined) this.m[3] = m10;
    if (m11 !== undefined) this.m[4] = m11;
    if (m12 !== undefined) this.m[5] = m12;
    if (m20 !== undefined) this.m[6] = m20;
    if (m21 !== undefined) this.m[7] = m21;
    if (m22 !== undefined) this.m[8] = m22;
  }

  static clone(source: Matrix3Like): Matrix3 {
    const m = new Matrix3();
    this.copy(m, source);
    return m;
  }

  static copyColumnFrom(out: Matrix3Like, column: number, source: Vector3Like): void {
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

  static copyColumnTo(out: Vector3Like, column: number, source: Matrix3Like): void {
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

  static copy(out: Matrix3Like, source: Matrix3Like): void {
    out.m.set(source.m);
  }

  copyFrom(source: Matrix3Like): Matrix3 {
    this.m.set(source.m);
    return this;
  }

  static copyRowFrom(out: Matrix3Like, row: number, source: Vector3Like): void {
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

  static copyRowTo(out: Vector3Like, row: number, source: Matrix3Like): void {
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

  static equals(a: Matrix3Like | null | undefined, b: Matrix3Like | null | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < 9; i++) {
      if (a.m[i] !== b.m[i]) return false;
    }
    return true;
  }

  static identity(out: Matrix3Like): void {
    out.m.set(this.__identity);
  }

  identity(): Matrix3 {
    this.m.set(Matrix3.__identity);
    return this;
  }

  static inverse(out: Matrix3Like, source: Matrix3Like): void {
    const _in = source.m;
    const _out = out.m;

    if (this.isAffine(source)) {
      // Affine fast path
      const det = _in[0] * _in[4] - _in[1] * _in[3];

      if (det === 0) {
        _out[0] = _out[1] = _out[3] = _out[4] = 0;
        _out[2] = -_in[2];
        _out[5] = -_in[5];
        _out[6] = _out[7] = 0;
        _out[8] = 1;
        return;
      }

      const invDet = 1 / det;

      _out[0] = _in[4] * invDet;
      _out[1] = -_in[1] * invDet;
      _out[3] = -_in[3] * invDet;
      _out[4] = _in[0] * invDet;

      _out[2] = -(_out[0] * _in[2] + _out[3] * _in[5]);
      _out[5] = -(_out[1] * _in[2] + _out[4] * _in[5]);

      _out[6] = 0;
      _out[7] = 0;
      _out[8] = 1;
      return;
    }

    const det =
      _in[0] * _in[4] * _in[8] +
      _in[1] * _in[5] * _in[6] +
      _in[2] * _in[3] * _in[7] -
      _in[2] * _in[4] * _in[6] -
      _in[1] * _in[3] * _in[8] -
      _in[0] * _in[5] * _in[7];

    if (det === 0) {
      throw new Error('Matrix is not invertable');
    }

    const inv = 1 / det;

    _out[0] = (_in[4] * _in[8] - _in[5] * _in[7]) * inv;
    _out[1] = (_in[2] * _in[7] - _in[1] * _in[8]) * inv;
    _out[2] = (_in[1] * _in[5] - _in[2] * _in[4]) * inv;

    _out[3] = (_in[5] * _in[6] - _in[3] * _in[8]) * inv;
    _out[4] = (_in[0] * _in[8] - _in[2] * _in[6]) * inv;
    _out[5] = (_in[2] * _in[3] - _in[0] * _in[5]) * inv;

    _out[6] = (_in[3] * _in[7] - _in[4] * _in[6]) * inv;
    _out[7] = (_in[1] * _in[6] - _in[0] * _in[7]) * inv;
    _out[8] = (_in[0] * _in[4] - _in[1] * _in[3]) * inv;
  }

  inverse(): Matrix3 {
    Matrix3.inverse(this, this);
    return this;
  }

  static isAffine(source: Matrix3Like): boolean {
    return source.m[6] === 0 && source.m[7] === 0 && source.m[8] === 1;
  }

  /**
   * out = a * b
   */
  static multiply(out: Matrix3Like, a: Matrix3Like, b: Matrix3Like): void {
    const _a = a.m;
    const _b = b.m;
    const _out = out.m;

    if (this.isAffine(a) && this.isAffine(b)) {
      _out[0] = _a[0] * _b[0] + _a[1] * _b[3];
      _out[1] = _a[0] * _b[1] + _a[1] * _b[4];
      _out[2] = _a[0] * _b[2] + _a[1] * _b[5] + _a[2];

      _out[3] = _a[3] * _b[0] + _a[4] * _b[3];
      _out[4] = _a[3] * _b[1] + _a[4] * _b[4];
      _out[5] = _a[3] * _b[2] + _a[4] * _b[5] + _a[5];

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

  multiply(source: Matrix3Like): Matrix3 {
    Matrix3.multiply(this, this, source);
    return this;
  }

  static rotate(out: Matrix3Like, source: Matrix3Like, theta: number): void {
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const a = source.m;
    const o = out.m;

    o[0] = a[0] * c + a[1] * s;
    o[1] = a[0] * -s + a[1] * c;
    o[2] = a[2];

    o[3] = a[3] * c + a[4] * s;
    o[4] = a[3] * -s + a[4] * c;
    o[5] = a[5];

    o[6] = a[6] * c + a[7] * s;
    o[7] = a[6] * -s + a[7] * c;
    o[8] = a[8];
  }

  rotate(theta: number): Matrix3 {
    Matrix3.rotate(this, this, theta);
    return this;
  }

  static scale(out: Matrix3Like, source: Matrix3Like, sx: number, sy: number): void {
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

  scale(sx: number, sy: number): Matrix3 {
    Matrix3.scale(this, this, sx, sy);
    return this;
  }

  static set(
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

  static translate(out: Matrix3Like, source: Matrix3Like, tx: number, ty: number): void {
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

  translate(tx: number, ty: number): Matrix3 {
    Matrix3.translate(this, this, tx, ty);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this.m[0];
  }

  set a(value: number) {
    this.m[0] = value;
  }

  get b(): number {
    return this.m[1];
  }

  set b(value: number) {
    this.m[1] = value;
  }

  get c(): number {
    return this.m[3];
  }

  set c(value: number) {
    this.m[3] = value;
  }

  get d(): number {
    return this.m[4];
  }

  set d(value: number) {
    this.m[4] = value;
  }

  get m00(): number {
    return this.m[0];
  }

  get m01(): number {
    return this.m[1];
  }

  get m02(): number {
    return this.m[2];
  }

  get m10(): number {
    return this.m[3];
  }

  get m11(): number {
    return this.m[4];
  }

  get m12(): number {
    return this.m[5];
  }

  get m20(): number {
    return this.m[6];
  }

  get m21(): number {
    return this.m[7];
  }

  get m22(): number {
    return this.m[8];
  }

  get tx(): number {
    return this.m[2];
  }

  set tx(value: number) {
    this.m[2] = value;
  }

  get ty(): number {
    return this.m[5];
  }

  set ty(value: number) {
    this.m[5] = value;
  }
}
