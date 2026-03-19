import { matrix3x2 } from '@flighthq/geometry';
import type { Matrix3x2 as MatrixType } from '@flighthq/types';

import type Matrix3 from './Matrix3';
import type Matrix4 from './Matrix4';
import Rectangle from './Rectangle';
import Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Matrix {
  public readonly value: MatrixType;

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    this.value = matrix3x2.create(a, b, c, d, tx, ty);
  }

  clone(): Matrix {
    const m = new Matrix();
    matrix3x2.copy(m.value, this.value);
    return m;
  }

  concat(b: Readonly<Matrix>): Matrix {
    matrix3x2.concat(this.value, this.value, b);
    return this;
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x2.copyColumnFrom(this.value, column, source);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x2.copyColumnTo(target, column, this.value);
  }

  copyFrom(source: Readonly<Matrix>): void {
    matrix3x2.copy(this.value, source);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x2.copyRowFrom(this.value, row, source);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x2.copyRowTo(target, row, this.value);
  }

  static createGradientTransform(
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Matrix {
    const out = new Matrix();
    matrix3x2.setGradientTransform(out.value, width, height, rotation, tx, ty);
    return out;
  }

  static createTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): Matrix {
    const out = new Matrix();
    matrix3x2.setTransform(out.value, scaleX, scaleY, rotation, tx, ty);
    return out;
  }

  equals(b: Readonly<Matrix> | null | undefined, compareTranslation: boolean = true): boolean {
    return matrix3x2.equals(this.value, b, compareTranslation);
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix3x3(out.value, source.value);
    return out;
  }

  static fromMatrix4(source: Readonly<Matrix4>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix4x4(out.value, source.value);
    return out;
  }

  static fromType(value: Readonly<MatrixType>): Matrix {
    const out = new Matrix();
    matrix3x2.copy(out.value, value);
    return out;
  }

  identity(): Matrix {
    matrix3x2.identity(this.value);
    return this;
  }

  inverse(): Matrix {
    matrix3x2.inverse(this.value, this.value);
    return this;
  }

  inverseTransformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPoint(out.value, this.value, point.value);
    return out;
  }

  inverseTransformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPointXY(out.value, this.value, x, y);
    return out;
  }

  inverseTransformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVector(out.value, this.value, vector.value);
    return out;
  }

  inverseTransformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVectorXY(out, this.value, x, y);
    return out;
  }

  multiply(b: Readonly<Matrix>): Matrix {
    matrix3x2.multiply(this.value, this.value, b.value);
    return this;
  }

  rotate(theta: number): Matrix {
    matrix3x2.rotate(this.value, this.value, theta);
    return this;
  }

  scale(sx: number, sy: number): Matrix {
    matrix3x2.scale(this.value, this.value, sx, sy);
    return this;
  }

  setGradientTransform(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setGradientTransform(this.value, width, height, rotation, tx, ty);
  }

  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    matrix3x2.setTo(this.value, a, b, c, d, tx, ty);
  }

  setTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setTransform(this.value, scaleX, scaleY, rotation, tx, ty);
  }

  transformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPoint(out, this.value, point.value);
    return out;
  }

  transformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPointXY(out, this.value, x, y);
    return out;
  }

  transformRect(source: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRect(out.value, this.value, source.value);
    return out;
  }

  transformRectVec2(a: Readonly<Vector2>, b: Readonly<Vector2>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectVec2(out.value, this.value, a.value, b.value);
    return out;
  }

  transformRectXY(ax: number, ay: number, bx: number, by: number): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectXY(out, this.value, ax, ay, bx, by);
    return out;
  }

  transformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVector(out.value, this.value, vector.value);
    return out;
  }

  transformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVectorXY(out.value, this.value, x, y);
    return out;
  }

  translate(dx: number, dy: number): Matrix {
    matrix3x2.translate(this.value, this.value, dx, dy);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this.value.a;
  }

  set a(value: number) {
    this.value.a = value;
  }

  get b(): number {
    return this.value.b;
  }

  set b(value: number) {
    this.value.b = value;
  }

  get c(): number {
    return this.value.c;
  }

  set c(value: number) {
    this.value.c = value;
  }

  get d(): number {
    return this.value.d;
  }

  set d(value: number) {
    this.value.d = value;
  }

  get tx(): number {
    return this.value.tx;
  }

  set tx(value: number) {
    this.value.tx = value;
  }

  get ty(): number {
    return this.value.ty;
  }

  set ty(value: number) {
    this.value.ty = value;
  }
}
