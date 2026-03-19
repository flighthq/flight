import { matrix4x4 } from '@flighthq/geometry';
import type { Matrix4x4 as Matrix4Type } from '@flighthq/types';

import type Matrix from './Matrix';
import type Matrix3 from './Matrix3';
import Vector3 from './Vector3';
import Vector4 from './Vector4';

export default class Matrix4 {
  public readonly value: Matrix4Type;

  constructor(
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
  ) {
    this.value = matrix4x4.create(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
  }

  append(other: Readonly<Matrix4>): void {
    matrix4x4.append(this.value, this.value, other.value);
  }

  appendRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.appendRotation(this.value, this.value, degrees, axis, pivotPoint);
  }

  appendScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.appendScale(this.value, this.value, xScale, yScale, zScale);
  }

  appendTranslation(x: number, y: number, z: number): void {
    matrix4x4.appendTranslation(this.value, this.value, x, y, z);
  }

  clone(): Matrix4 {
    return Matrix4.fromType(this.value);
  }

  copyColumnFrom(column: number, source: Readonly<Vector4>): void {
    matrix4x4.copyColumnFrom(this.value, column, source.value);
  }

  copyColumnTo(column: number, target: Vector4): void {
    matrix4x4.copyColumnTo(target.value, column, this.value);
  }

  copyFrom(source: Readonly<Matrix4>): void {
    matrix4x4.copy(this.value, source.value);
  }

  copyRowFrom(row: number, source: Readonly<Vector4>): void {
    matrix4x4.copyRowFrom(this.value, row, source.value);
  }

  copyRowTo(row: number, target: Vector4): void {
    matrix4x4.copyRowTo(target.value, row, this.value);
  }

  static create2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.set2D(out.value, a, b, c, d, tx, ty);
    return out;
  }

  static createOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setOrtho(out.value, left, right, bottom, top, zNear, zFar);
    return out;
  }

  static createPerspective(fov: number, aspect: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setPerspective(out.value, fov, aspect, zNear, zFar);
    return out;
  }

  equals(b: Readonly<Matrix4> | null | undefined): boolean {
    if (!b) return false;
    return matrix4x4.equals(this.value, b.value);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x2(out.value, source.value);
    return out;
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x3(out.value, source.value);
    return out;
  }

  static fromType(value: Readonly<Matrix4Type>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.copy(out.value, value);
    return out;
  }

  get(row: number, column: number): number {
    return matrix4x4.get(this.value, row, column);
  }

  identity(): void {
    matrix4x4.identity(this.value);
  }

  static interpolate(a: Readonly<Matrix4>, b: Readonly<Matrix4>, t: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.interpolate(out.value, a.value, b.value, t);
    return out;
  }

  inverse(): boolean {
    return matrix4x4.inverse(this.value, this.value);
  }

  multiply(b: Readonly<Matrix4>): void {
    matrix4x4.multiply(this.value, this.value, b.value);
  }

  prepend(other: Readonly<Matrix4>): void {
    matrix4x4.prepend(this.value, this.value, other.value);
  }

  prependRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.prependRotation(this.value, this.value, degrees, axis, pivotPoint);
  }

  prependScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.prependScale(this.value, this.value, xScale, yScale, zScale);
  }

  prependTranslation(x: number, y: number, z: number): void {
    matrix4x4.prependTranslation(this.value, this.value, x, y, z);
  }

  rotate(axis: Readonly<Vector3>, degrees: number): void {
    matrix4x4.rotate(this.value, this.value, axis, degrees);
  }

  scale(sx: number, sy: number, sz: number): void {
    matrix4x4.scale(this.value, this.value, sx, sy, sz);
  }

  set(row: number, column: number, value: number): void {
    matrix4x4.set(this.value, row, column, value);
  }

  set2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): void {
    matrix4x4.set2D(this.value, a, b, c, d, tx, ty);
  }

  setOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): void {
    matrix4x4.setOrtho(this.value, left, right, bottom, top, zNear, zFar);
  }

  setPerspective(fov: number, aspect: number, zNear: number, zFar: number): void {
    matrix4x4.setPerspective(this.value, fov, aspect, zNear, zFar);
  }

  setTo(
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
    matrix4x4.setTo(this.value, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
  }

  transformPoint(point: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    matrix4x4.transformPoint(out.value, this.value, point.value);
    return out;
  }

  transformVector(vector: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    matrix4x4.transformVector(out.value, this.value, vector.value);
    return out;
  }

  transformVectors(source: Readonly<Float32Array>, out: Float32Array): void {
    matrix4x4.transformVectors(out, this.value, source);
  }

  translate(tx: number, ty: number, tz: number): void {
    matrix4x4.translate(this.value, this.value, tx, ty, tz);
  }

  transpose(): void {
    matrix4x4.transpose(this.value, this.value);
  }

  // Get & Set Methods

  get determinant(): number {
    return matrix4x4.determinant(this.value);
  }

  get isAffine(): boolean {
    return matrix4x4.isAffine(this.value);
  }

  get position(): Vector3 {
    const out = new Vector3();
    matrix4x4.position(out.value, this.value);
    return out;
  }

  set position(value: Readonly<Vector3>) {
    matrix4x4.setPosition(this.value, value.value);
  }
}
