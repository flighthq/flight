import { matrix4x4 } from '@flighthq/geometry';
import type { Matrix4x4 as RawMatrix4 } from '@flighthq/types';

import FlightObject from '../FlightObject';
import type Matrix from './Matrix';
import type Matrix3 from './Matrix3';
import Vector3 from './Vector3';
import Vector4 from './Vector4';

export default class Matrix4 extends FlightObject<RawMatrix4> {
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
    super();
    const m = this.__raw.m;
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
  }

  protected override __create() {
    return matrix4x4.create();
  }

  append(other: Readonly<Matrix4>): void {
    matrix4x4.append(this.__raw, this.__raw, other.raw);
  }

  appendRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.appendRotation(this.__raw, this.__raw, degrees, axis, pivotPoint);
  }

  appendScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.appendScale(this.__raw, this.__raw, xScale, yScale, zScale);
  }

  appendTranslation(x: number, y: number, z: number): void {
    matrix4x4.appendTranslation(this.__raw, this.__raw, x, y, z);
  }

  clone(): Matrix4 {
    return Matrix4.fromRaw(this.__raw);
  }

  copyColumnFrom(column: number, source: Readonly<Vector4>): void {
    matrix4x4.copyColumnFrom(this.__raw, column, source.raw);
  }

  copyColumnTo(column: number, target: Vector4): void {
    matrix4x4.copyColumnTo(target.raw, column, this.__raw);
  }

  copyFrom(source: Readonly<Matrix4>): void {
    matrix4x4.copy(this.__raw, source.raw);
  }

  copyRowFrom(row: number, source: Readonly<Vector4>): void {
    matrix4x4.copyRowFrom(this.__raw, row, source.raw);
  }

  copyRowTo(row: number, target: Vector4): void {
    matrix4x4.copyRowTo(target.raw, row, this.__raw);
  }

  static create2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.set2D(out.raw, a, b, c, d, tx, ty);
    return out;
  }

  static createOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setOrtho(out.raw, left, right, bottom, top, zNear, zFar);
    return out;
  }

  static createPerspective(fov: number, aspect: number, zNear: number, zFar: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.setPerspective(out.raw, fov, aspect, zNear, zFar);
    return out;
  }

  equals(b: Readonly<Matrix4> | null | undefined): boolean {
    if (!b) return false;
    return matrix4x4.equals(this.__raw, b.raw);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x2(out.raw, source.raw);
    return out;
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix4 {
    const out = new Matrix4();
    matrix4x4.fromMatrix3x3(out.raw, source.raw);
    return out;
  }

  static fromRaw(raw: Readonly<RawMatrix4>): Matrix4 {
    return FlightObject.getOrCreate(raw, Matrix4)!;
  }

  get(row: number, column: number): number {
    return matrix4x4.get(this.__raw, row, column);
  }

  identity(): void {
    matrix4x4.identity(this.__raw);
  }

  static interpolate(a: Readonly<Matrix4>, b: Readonly<Matrix4>, t: number): Matrix4 {
    const out = new Matrix4();
    matrix4x4.interpolate(out.raw, a.raw, b.raw, t);
    return out;
  }

  inverse(): boolean {
    return matrix4x4.inverse(this.__raw, this.__raw);
  }

  multiply(b: Readonly<Matrix4>): void {
    matrix4x4.multiply(this.__raw, this.__raw, b.raw);
  }

  prepend(other: Readonly<Matrix4>): void {
    matrix4x4.prepend(this.__raw, this.__raw, other.raw);
  }

  prependRotation(degrees: number, axis: Readonly<Vector4>, pivotPoint?: Readonly<Vector4>): void {
    matrix4x4.prependRotation(this.__raw, this.__raw, degrees, axis, pivotPoint);
  }

  prependScale(xScale: number, yScale: number, zScale: number): void {
    matrix4x4.prependScale(this.__raw, this.__raw, xScale, yScale, zScale);
  }

  prependTranslation(x: number, y: number, z: number): void {
    matrix4x4.prependTranslation(this.__raw, this.__raw, x, y, z);
  }

  rotate(axis: Readonly<Vector3>, degrees: number): void {
    matrix4x4.rotate(this.__raw, this.__raw, axis, degrees);
  }

  scale(sx: number, sy: number, sz: number): void {
    matrix4x4.scale(this.__raw, this.__raw, sx, sy, sz);
  }

  set(row: number, column: number, value: number): void {
    matrix4x4.set(this.__raw, row, column, value);
  }

  set2D(a: number, b: number, c: number, d: number, tx?: number, ty?: number): void {
    matrix4x4.set2D(this.__raw, a, b, c, d, tx, ty);
  }

  setOrtho(left: number, right: number, bottom: number, top: number, zNear: number, zFar: number): void {
    matrix4x4.setOrtho(this.__raw, left, right, bottom, top, zNear, zFar);
  }

  setPerspective(fov: number, aspect: number, zNear: number, zFar: number): void {
    matrix4x4.setPerspective(this.__raw, fov, aspect, zNear, zFar);
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
    matrix4x4.setTo(this.__raw, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33);
  }

  transformPoint(point: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    matrix4x4.transformPoint(out.raw, this.__raw, point.raw);
    return out;
  }

  transformVector(vector: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    matrix4x4.transformVector(out.raw, this.__raw, vector.raw);
    return out;
  }

  transformVectors(source: Readonly<Float32Array>, out: Float32Array): void {
    matrix4x4.transformVectors(out, this.__raw, source);
  }

  translate(tx: number, ty: number, tz: number): void {
    matrix4x4.translate(this.__raw, this.__raw, tx, ty, tz);
  }

  transpose(): void {
    matrix4x4.transpose(this.__raw, this.__raw);
  }

  // Get & Set Methods

  get determinant(): number {
    return matrix4x4.determinant(this.__raw);
  }

  get isAffine(): boolean {
    return matrix4x4.isAffine(this.__raw);
  }

  get position(): Vector3 {
    const out = new Vector3();
    matrix4x4.position(out.raw, this.__raw);
    return out;
  }

  set position(value: Readonly<Vector3>) {
    matrix4x4.setPosition(this.__raw, value.raw);
  }
}
