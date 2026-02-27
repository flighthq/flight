import { matrix3x2 } from '@flighthq/geom';
import type { Matrix3x2 as MatrixModel } from '@flighthq/types';

import type Matrix3 from './Matrix3';
import type Matrix4 from './Matrix4';
import Rectangle from './Rectangle';
import Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Matrix {
  public readonly model: MatrixModel;

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    this.model = matrix3x2.create(a, b, c, d, tx, ty);
  }

  clone(): Matrix {
    const m = new Matrix();
    matrix3x2.copy(m.model, this.model);
    return m;
  }

  concat(b: Readonly<Matrix>): Matrix {
    matrix3x2.concat(this.model, this.model, b);
    return this;
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x2.copyColumnFrom(this.model, column, source);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x2.copyColumnTo(target, column, this.model);
  }

  copyFrom(source: Readonly<Matrix>): void {
    matrix3x2.copy(this.model, source);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x2.copyRowFrom(this.model, row, source);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x2.copyRowTo(target, row, this.model);
  }

  static createGradientTransform(
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Matrix {
    const out = new Matrix();
    matrix3x2.setGradientTransform(out.model, width, height, rotation, tx, ty);
    return out;
  }

  static createTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): Matrix {
    const out = new Matrix();
    matrix3x2.setTransform(out.model, scaleX, scaleY, rotation, tx, ty);
    return out;
  }

  equals(b: Readonly<Matrix> | null | undefined, compareTranslation: boolean = true): boolean {
    return matrix3x2.equals(this.model, b, compareTranslation);
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix3x3(out.model, source.model);
    return out;
  }

  static fromMatrix4(source: Readonly<Matrix4>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix4x4(out.model, source.model);
    return out;
  }

  static fromModel(model: Readonly<MatrixModel>): Matrix {
    const out = new Matrix();
    matrix3x2.copy(out.model, model);
    return out;
  }

  identity(): Matrix {
    matrix3x2.identity(this.model);
    return this;
  }

  inverse(): Matrix {
    matrix3x2.inverse(this.model, this.model);
    return this;
  }

  inverseTransformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPoint(out.model, this.model, point.model);
    return out;
  }

  inverseTransformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPointXY(out.model, this.model, x, y);
    return out;
  }

  inverseTransformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVector(out.model, this.model, vector.model);
    return out;
  }

  inverseTransformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVectorXY(out, this.model, x, y);
    return out;
  }

  multiply(b: Readonly<Matrix>): Matrix {
    matrix3x2.multiply(this.model, this.model, b.model);
    return this;
  }

  rotate(theta: number): Matrix {
    matrix3x2.rotate(this.model, this.model, theta);
    return this;
  }

  scale(sx: number, sy: number): Matrix {
    matrix3x2.scale(this.model, this.model, sx, sy);
    return this;
  }

  setGradientTransform(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setGradientTransform(this.model, width, height, rotation, tx, ty);
  }

  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    matrix3x2.setTo(this.model, a, b, c, d, tx, ty);
  }

  setTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setTransform(this.model, scaleX, scaleY, rotation, tx, ty);
  }

  transformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPoint(out, this.model, point.model);
    return out;
  }

  transformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPointXY(out, this.model, x, y);
    return out;
  }

  transformRect(source: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRect(out.model, this.model, source.model);
    return out;
  }

  transformRectVec2(a: Readonly<Vector2>, b: Readonly<Vector2>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectVec2(out.model, this.model, a.model, b.model);
    return out;
  }

  transformRectXY(ax: number, ay: number, bx: number, by: number): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectXY(out, this.model, ax, ay, bx, by);
    return out;
  }

  transformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVector(out.model, this.model, vector.model);
    return out;
  }

  transformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVectorXY(out.model, this.model, x, y);
    return out;
  }

  translate(dx: number, dy: number): Matrix {
    matrix3x2.translate(this.model, this.model, dx, dy);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this.model.a;
  }

  set a(value: number) {
    this.model.a = value;
  }

  get b(): number {
    return this.model.b;
  }

  set b(value: number) {
    this.model.b = value;
  }

  get c(): number {
    return this.model.c;
  }

  set c(value: number) {
    this.model.c = value;
  }

  get d(): number {
    return this.model.d;
  }

  set d(value: number) {
    this.model.d = value;
  }

  get tx(): number {
    return this.model.tx;
  }

  set tx(value: number) {
    this.model.tx = value;
  }

  get ty(): number {
    return this.model.ty;
  }

  set ty(value: number) {
    this.model.ty = value;
  }
}
