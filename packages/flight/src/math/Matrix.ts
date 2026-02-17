import { matrix3x2 } from '@flighthq/math';
import type {
  Matrix3x2 as MatrixLike,
  Matrix3x3 as Matrix3Like,
  Matrix4x4 as Matrix4Like,
  Rectangle as RectangleLike,
  Vector2 as Vector2Like,
  Vector3 as Vector3Like,
} from '@flighthq/types';

import Rectangle from './Rectangle';
import Vector2 from './Vector2';

export default class Matrix {
  private __data: MatrixLike;

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    this.__data = matrix3x2.create(a, b, c, d, tx, ty);
  }

  clone(): Matrix {
    const m = new Matrix();
    m.copyFrom(this.__data);
    return m;
  }

  concat(b: Readonly<MatrixLike>): Matrix {
    matrix3x2.concat(this.__data, this.__data, b);
    return this;
  }

  copyColumnFrom(column: number, source: Readonly<Vector3Like>): void {
    matrix3x2.copyColumnFrom(this.__data, column, source);
  }

  copyColumnTo(column: number, target: Vector3Like): void {
    matrix3x2.copyColumnTo(target, column, this.__data);
  }

  copyFrom(source: Readonly<MatrixLike>): void {
    matrix3x2.copy(this.__data, source);
  }

  copyRowFrom(row: number, source: Readonly<Vector3Like>): void {
    matrix3x2.copyRowFrom(this.__data, row, source);
  }

  copyRowTo(row: number, target: Vector3Like): void {
    matrix3x2.copyRowTo(target, row, this.__data);
  }

  static createGradientTransform(
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Matrix {
    const out = new Matrix();
    out.setGradientTransform(width, height, rotation, tx, ty);
    return out;
  }

  static createTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): Matrix {
    const out = new Matrix();
    out.setTransform(scaleX, scaleY, rotation, tx, ty);
    return out;
  }

  equals(b: Readonly<MatrixLike> | null | undefined, compareTranslation: boolean = true): boolean {
    return matrix3x2.equals(this.__data, b, compareTranslation);
  }

  static fromMatrix3(source: Readonly<Matrix3Like>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix3x3(out, source);
    return out;
  }

  static fromMatrix4(source: Readonly<Matrix4Like>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix4x4(out, source);
    return out;
  }

  identity(): Matrix {
    matrix3x2.identity(this.__data);
    return this;
  }

  inverse(): Matrix {
    matrix3x2.inverse(this.__data, this.__data);
    return this;
  }

  inverseTransformPoint(point: Readonly<Vector2Like>): Vector2 {
    return this.inverseTransformPointXY(point.x, point.y);
  }

  inverseTransformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPointXY(out, this.__data, x, y);
    return out;
  }

  inverseTransformVector(vector: Readonly<Vector2Like>): Vector2 {
    return this.inverseTransformVectorXY(vector.x, vector.y);
  }

  inverseTransformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVectorXY(out, this.__data, x, y);
    return out;
  }

  multiply(b: Readonly<MatrixLike>): Matrix {
    matrix3x2.multiply(this.__data, this.__data, b);
    return this;
  }

  rotate(theta: number): Matrix {
    matrix3x2.rotate(this.__data, this.__data, theta);
    return this;
  }

  scale(sx: number, sy: number): Matrix {
    matrix3x2.scale(this.__data, this.__data, sx, sy);
    return this;
  }

  setGradientTransform(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setGradientTransform(this.__data, width, height, rotation, tx, ty);
  }

  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    matrix3x2.setTo(this.__data, a, b, c, d, tx, ty);
  }

  setTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setTransform(this.__data, scaleX, scaleY, rotation, tx, ty);
  }

  transformPoint(point: Readonly<Vector2Like>): Vector2 {
    return this.transformPointXY(point.x, point.y);
  }

  transformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPointXY(out, this.__data, x, y);
    return out;
  }

  transformRect(source: Readonly<RectangleLike>): Rectangle {
    return this.transformRectXY(source.x, source.y, source.x + source.width, source.y + source.height);
  }

  transformRectVec2(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): Rectangle {
    return this.transformRectXY(a.x, a.y, b.x, b.y);
  }

  transformRectXY(ax: number, ay: number, bx: number, by: number): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectXY(out, this.__data, ax, ay, bx, by);
    return out;
  }

  transformVector(vector: Readonly<Vector2Like>): Vector2 {
    return this.transformVectorXY(vector.x, vector.y);
  }

  transformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVectorXY(out, this.__data, x, y);
    return out;
  }

  translate(dx: number, dy: number): Matrix {
    matrix3x2.translate(this.__data, this.__data, dx, dy);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this.__data.a;
  }

  set a(value: number) {
    this.__data.a = value;
  }

  get b(): number {
    return this.__data.b;
  }

  set b(value: number) {
    this.__data.b = value;
  }

  get c(): number {
    return this.__data.c;
  }

  set c(value: number) {
    this.__data.c = value;
  }

  get d(): number {
    return this.__data.d;
  }

  set d(value: number) {
    this.__data.d = value;
  }

  get tx(): number {
    return this.__data.tx;
  }

  set tx(value: number) {
    this.__data.tx = value;
  }

  get ty(): number {
    return this.__data.ty;
  }

  set ty(value: number) {
    this.__data.ty = value;
  }
}
