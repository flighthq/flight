import { matrix4x4 } from '@flighthq/geom';
import type { Matrix4x4 as Matrix4Model } from '@flighthq/types';

import type Matrix from './Matrix';
import type Matrix3 from './Matrix3';
import Vector3 from './Vector3';
import Vector4 from './Vector4';

export default class Matrix4 {
  public readonly model: Matrix4Model;

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
    this.model = matrix4x4.create(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
  }

  append(other: Readonly<Matrix4>): void {
    matrix4x4.append(this.model, this.model, other.model);
  }

  appendRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.appendRotation(this.model, this.model, degrees, axis, pivotPoint);
  }

  appendScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.appendScale(this.model, this.model, xScale, yScale, zScale);
  }

  appendTranslation(x: number, y: number, z: number): void {
    matrix4x4.appendTranslation(this.model, this.model, x, y, z);
  }

  clone(): Matrix4 {
    return Matrix4.fromModel(this.model);
  }

  copyColumnFrom(column: number, source: Readonly<Vector4>): void {
    matrix4x4.copyColumnFrom(this.model, column, source.model);
  }

  copyColumnTo(column: number, target: Vector4): void {
    matrix4x4.copyColumnTo(target.model, column, this.model);
  }

  copyFrom(source: Readonly<Matrix4>): void {
    matrix4x4.copy(this.model, source.model);
  }

  copyRowFrom(row: number, source: Readonly<Vector4>): void {
    matrix4x4.copyRowFrom(this.model, row, source.model);
  }

  copyRowTo(row: number, target: Vector4): void {
    matrix4x4.copyRowTo(target.model, row, this.model);
  }

  static create2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.set2D(out.model, a, b, c, d, tx, ty);
    return out;
  }

  static createOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setOrtho(out.model, left, right, bottom, top, zNear, zFar);
    return out;
  }

  static createPerspective(fov: number, aspect: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setPerspective(out.model, fov, aspect, zNear, zFar);
    return out;
  }

  equals(b: Readonly<Matrix4> | null | undefined): boolean {
    if (!b) return false;
    return matrix4x4.equals(this.model, b.model);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x2(out.model, source.model);
    return out;
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x3(out.model, source.model);
    return out;
  }

  static fromModel(model: Readonly<Matrix4Model>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.copy(out.model, model);
    return out;
  }

  get(row: number, column: number): number {
    return matrix4x4.get(this.model, row, column);
  }

  identity(): void {
    matrix4x4.identity(this.model);
  }

  static interpolate(a: Readonly<Matrix4>, b: Readonly<Matrix4>, t: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.interpolate(out.model, a.model, b.model, t);
    return out;
  }

  inverse(): boolean {
    return matrix4x4.inverse(this.model, this.model);
  }

  multiply(b: Readonly<Matrix4>): void {
    matrix4x4.multiply(this.model, this.model, b.model);
  }

  prepend(other: Readonly<Matrix4>): void {
    matrix4x4.prepend(this.model, this.model, other.model);
  }

  prependRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.prependRotation(this.model, this.model, degrees, axis, pivotPoint);
  }

  prependScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.prependScale(this.model, this.model, xScale, yScale, zScale);
  }

  prependTranslation(x: number, y: number, z: number): void {
    matrix4x4.prependTranslation(this.model, this.model, x, y, z);
  }

  rotate(axis: Readonly<Vector3>, degrees: number): void {
    matrix4x4.rotate(this.model, this.model, axis, degrees);
  }

  scale(sx: number, sy: number, sz: number): void {
    matrix4x4.scale(this.model, this.model, sx, sy, sz);
  }

  set(row: number, column: number, value: number): void {
    matrix4x4.set(this.model, row, column, value);
  }

  set2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): void {
    matrix4x4.set2D(this.model, a, b, c, d, tx, ty);
  }

  setOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): void {
    matrix4x4.setOrtho(this.model, left, right, bottom, top, zNear, zFar);
  }

  setPerspective(fov: number, aspect: number, zNear: number, zFar: number): void {
    matrix4x4.setPerspective(this.model, fov, aspect, zNear, zFar);
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
    matrix4x4.setTo(this.model, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
  }

  transformPoint(point: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    matrix4x4.transformPoint(out.model, this.model, point.model);
    return out;
  }

  transformVector(vector: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    matrix4x4.transformVector(out.model, this.model, vector.model);
    return out;
  }

  transformVectors(source: Readonly<Float32Array>, out: Float32Array): void {
    matrix4x4.transformVectors(out, this.model, source);
  }

  translate(tx: number, ty: number, tz: number): void {
    matrix4x4.translate(this.model, this.model, tx, ty, tz);
  }

  transpose(): void {
    matrix4x4.transpose(this.model, this.model);
  }

  // Get & Set Methods

  get determinant(): number {
    return matrix4x4.determinant(this.model);
  }

  get isAffine(): boolean {
    return matrix4x4.isAffine(this.model);
  }

  get position(): Vector3 {
    const out = new Vector3();
    matrix4x4.position(out.model, this.model);
    return out;
  }

  set position(value: Readonly<Vector3>) {
    matrix4x4.setPosition(this.model, value.model);
  }
}
