import type { Matrix3 as Matrix3Like, Vector3 as Vector3Like } from '@flighthq/types';

/**
 * A 3×3 homogeneous matrix.
 *
 * Stored in column-vector form:
 *
 * [ m00 m01 m02 ]
 * [ m10 m11 m12 ]
 * [ m20 m21 m22 ]
 *
 * For 2D affine transforms:
 * m20 = 0, m21 = 0, m22 = 1
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

  static clone(src: Matrix3Like): Matrix3 {
    const m = new Matrix3();
    this.copyFrom(m, src);
    return m;
  }

  /**
   * Multiplies target by source, applying the result to target
   *
   * target *= source
   *
   * @see multiply
   */
  static concat(target: Matrix3Like, source: Matrix3Like): void {
    this.multiply(target, target, source);
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

  static copyFrom(out: Matrix3Like, src: Matrix3Like): void {
    out.m.set(src.m);
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

  static equals(a?: Matrix3Like | null, b?: Matrix3Like | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    for (let i = 0; i < 9; i++) {
      if (a.m[i] !== b.m[i]) return false;
    }
    return true;
  }

  static identity(out: Matrix3Like): void {
    out.m.set(Matrix3.__identity);
  }

  static inverse(out: Matrix3Like, m: Matrix3Like): void {
    const det =
      m.m[0] * m.m[4] * m.m[8] +
      m.m[1] * m.m[5] * m.m[6] +
      m.m[2] * m.m[3] * m.m[7] -
      m.m[2] * m.m[4] * m.m[6] -
      m.m[1] * m.m[3] * m.m[8] -
      m.m[0] * m.m[5] * m.m[7];

    if (det === 0) {
      this.identity(out);
      return;
    }

    const inv = 1 / det;

    out.m[0] = (m.m[4] * m.m[8] - m.m[5] * m.m[7]) * inv;
    out.m[1] = (m.m[2] * m.m[7] - m.m[1] * m.m[8]) * inv;
    out.m[2] = (m.m[1] * m.m[5] - m.m[2] * m.m[4]) * inv;

    out.m[3] = (m.m[5] * m.m[6] - m.m[3] * m.m[8]) * inv;
    out.m[4] = (m.m[0] * m.m[8] - m.m[2] * m.m[6]) * inv;
    out.m[5] = (m.m[2] * m.m[3] - m.m[0] * m.m[5]) * inv;

    out.m[6] = (m.m[3] * m.m[7] - m.m[4] * m.m[6]) * inv;
    out.m[7] = (m.m[1] * m.m[6] - m.m[0] * m.m[7]) * inv;
    out.m[8] = (m.m[0] * m.m[4] - m.m[1] * m.m[3]) * inv;
  }

  /**
   * out = a * b
   */
  static multiply(out: Matrix3Like, a: Matrix3Like, b: Matrix3Like): void {
    // First row of a * columns of b
    const m00 = a.m[0] * b.m[0] + a.m[1] * b.m[3] + a.m[2] * b.m[6];
    const m01 = a.m[0] * b.m[1] + a.m[1] * b.m[4] + a.m[2] * b.m[7];
    const m02 = a.m[0] * b.m[2] + a.m[1] * b.m[5] + a.m[2] * b.m[8];

    // Second row of a * columns of b
    const m10 = a.m[3] * b.m[0] + a.m[4] * b.m[3] + a.m[5] * b.m[6];
    const m11 = a.m[3] * b.m[1] + a.m[4] * b.m[4] + a.m[5] * b.m[7];
    const m12 = a.m[3] * b.m[2] + a.m[4] * b.m[5] + a.m[5] * b.m[8];

    // Third row of a * columns of b
    const m20 = a.m[6] * b.m[0] + a.m[7] * b.m[3] + a.m[8] * b.m[6];
    const m21 = a.m[6] * b.m[1] + a.m[7] * b.m[4] + a.m[8] * b.m[7];
    const m22 = a.m[6] * b.m[2] + a.m[7] * b.m[5] + a.m[8] * b.m[8];

    // Assign the result to the output matrix
    out.m[0] = m00;
    out.m[1] = m01;
    out.m[2] = m02;
    out.m[3] = m10;
    out.m[4] = m11;
    out.m[5] = m12;
    out.m[6] = m20;
    out.m[7] = m21;
    out.m[8] = m22;
  }

  static rotate(out: Matrix3Like, theta: number): void {
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply the rotation matrix to the current matrix values
    const m = out.m;

    // Save the current values of the matrix
    const a = m[0],
      b = m[1],
      c0 = m[3],
      d = m[4];

    // Perform the rotation: Apply the 90-degree rotation to the current matrix values
    m[0] = c * a - s * c0; // a'
    m[1] = c * b - s * d; // b'
    m[3] = s * a + c * c0; // c'
    m[4] = s * b + c * d; // d'
  }

  static scale(out: Matrix3Like, sx: number, sy: number): void {
    this.identity(out);
    out.m[0] = sx;
    out.m[4] = sy;
  }

  static translation(out: Matrix3Like, tx: number, ty: number): void {
    this.identity(out);
    out.m[2] = tx;
    out.m[5] = ty;
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
