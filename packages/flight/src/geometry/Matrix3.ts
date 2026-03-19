import { matrix3x3 } from '@flighthq/geometry';
import type { Matrix3x3 as Matrix3Type } from '@flighthq/types';

import type Matrix from './Matrix';
import type Matrix4 from './Matrix4';
import type Vector3 from './Vector3';

export default class Matrix3 {
  public readonly value: Matrix3Type;

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
    this.value = matrix3x3.create(m00, m01, m02, m10, m11, m12, m20, m21, m22);
  }

  clone(): Matrix3 {
    return Matrix3.fromType(this.value);
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x3.copyColumnFrom(this.value, column, source.value);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x3.copyColumnTo(target.value, column, this.value);
  }

  copyFrom(source: Readonly<Matrix3>): void {
    matrix3x3.copy(this.value, source.value);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x3.copyRowFrom(this.value, row, source.value);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x3.copyRowTo(target.value, row, this.value);
  }

  equals(b: Readonly<Matrix3> | null | undefined): boolean {
    if (!b) return false;
    return matrix3x3.equals(this.value, b.value);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix3x2(out.value, source.value);
    return out;
  }

  static fromMatrix4x4(source: Readonly<Matrix4>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix4x4(out.value, source.value);
    return out;
  }

  static fromType(value: Readonly<Matrix3Type>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.copy(out.value, value);
    return out;
  }

  get(row: number, column: number): number {
    return matrix3x3.get(this.value, row, column);
  }

  identity(): void {
    matrix3x3.identity(this.value);
  }

  inverse(): void {
    matrix3x3.inverse(this.value, this.value);
  }

  multiply(b: Readonly<Matrix3>): void {
    matrix3x3.multiply(this.value, this.value, b.value);
  }

  rotate(theta: number): void {
    matrix3x3.rotate(this.value, this.value, theta);
  }

  scale(sx: number, sy: number): void {
    matrix3x3.scale(this.value, this.value, sx, sy);
  }

  set(row: number, column: number, value: number): void {
    matrix3x3.set(this.value, row, column, value);
  }

  setTo(
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
    matrix3x3.setTo(this.value, m00, m01, m02, m10, m11, m12, m20, m21, m22);
  }

  translate(tx: number, ty: number): void {
    matrix3x3.translate(this.value, this.value, tx, ty);
  }

  // Get & Set Methods

  get isAffine(): boolean {
    return matrix3x3.isAffine(this.value);
  }
}
