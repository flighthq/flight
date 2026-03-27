import { matrix3x3 } from '@flighthq/geometry';
import type { Matrix3x3 as RawMatrix3 } from '@flighthq/types';

import FlightObject from '../FlightObject';
import type Matrix from './Matrix';
import type Matrix4 from './Matrix4';
import type Vector3 from './Vector3';

export default class Matrix3 extends FlightObject<RawMatrix3> {
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
    super();
    const m = this.__raw.m;
    if (m00 !== undefined) m[0] = m00;
    if (m01 !== undefined) m[1] = m01;
    if (m02 !== undefined) m[2] = m02;
    if (m10 !== undefined) m[3] = m10;
    if (m11 !== undefined) m[4] = m11;
    if (m12 !== undefined) m[5] = m12;
    if (m20 !== undefined) m[6] = m20;
    if (m21 !== undefined) m[7] = m21;
    if (m22 !== undefined) m[8] = m22;
  }

  protected override __create() {
    return matrix3x3.create();
  }

  clone(): Matrix3 {
    return Matrix3.fromRaw(this.__raw);
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x3.copyColumnFrom(this.__raw, column, source.raw);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x3.copyColumnTo(target.raw, column, this.__raw);
  }

  copyFrom(source: Readonly<Matrix3>): void {
    matrix3x3.copy(this.__raw, source.raw);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x3.copyRowFrom(this.__raw, row, source.raw);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x3.copyRowTo(target.raw, row, this.__raw);
  }

  equals(b: Readonly<Matrix3> | null | undefined): boolean {
    if (!b) return false;
    return matrix3x3.equals(this.__raw, b.raw);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix3x2(out.raw, source.raw);
    return out;
  }

  static fromMatrix4x4(source: Readonly<Matrix4>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix4x4(out.raw, source.raw);
    return out;
  }

  static fromRaw(raw: Readonly<RawMatrix3>): Matrix3 {
    return FlightObject.getOrCreate(raw, Matrix3)!;
  }

  get(row: number, column: number): number {
    return matrix3x3.get(this.__raw, row, column);
  }

  identity(): void {
    matrix3x3.identity(this.__raw);
  }

  inverse(): void {
    matrix3x3.inverse(this.__raw, this.__raw);
  }

  multiply(b: Readonly<Matrix3>): void {
    matrix3x3.multiply(this.__raw, this.__raw, b.raw);
  }

  rotate(theta: number): void {
    matrix3x3.rotate(this.__raw, this.__raw, theta);
  }

  scale(sx: number, sy: number): void {
    matrix3x3.scale(this.__raw, this.__raw, sx, sy);
  }

  set(row: number, column: number, value: number): void {
    matrix3x3.set(this.__raw, row, column, value);
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
    matrix3x3.setTo(this.__raw, m00, m01, m02, m10, m11, m12, m20, m21, m22);
  }

  translate(tx: number, ty: number): void {
    matrix3x3.translate(this.__raw, this.__raw, tx, ty);
  }

  // Get & Set Methods

  get m(): Float32Array {
    return this.__raw.m;
  }

  get isAffine(): boolean {
    return matrix3x3.isAffine(this.__raw);
  }
}
