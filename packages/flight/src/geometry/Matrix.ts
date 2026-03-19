import { matrix3x2 } from '@flighthq/geometry';
import type { Matrix3x2 as MatrixModel } from '@flighthq/types';

import type Matrix3 from './Matrix3';
import type Matrix4 from './Matrix4';
import Rectangle from './Rectangle';
import Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Matrix {
  protected _model: MatrixModel;

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    this._model = matrix3x2.create(a, b, c, d, tx, ty);
  }

  clone(): Matrix {
    const m = new Matrix();
    matrix3x2.copy(m.model, this._model);
    return m;
  }

  concat(b: Readonly<Matrix>): Matrix {
    matrix3x2.concat(this._model, this._model, b);
    return this;
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x2.copyColumnFrom(this._model, column, source);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x2.copyColumnTo(target, column, this._model);
  }

  copyFrom(source: Readonly<Matrix>): void {
    matrix3x2.copy(this._model, source);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x2.copyRowFrom(this._model, row, source);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x2.copyRowTo(target, row, this._model);
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
    return matrix3x2.equals(this._model, b, compareTranslation);
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
    matrix3x2.identity(this._model);
    return this;
  }

  inverse(): Matrix {
    matrix3x2.inverse(this._model, this._model);
    return this;
  }

  inverseTransformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPoint(out.model, this._model, point.model);
    return out;
  }

  inverseTransformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPointXY(out.model, this._model, x, y);
    return out;
  }

  inverseTransformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVector(out.model, this._model, vector.model);
    return out;
  }

  inverseTransformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVectorXY(out, this._model, x, y);
    return out;
  }

  multiply(b: Readonly<Matrix>): Matrix {
    matrix3x2.multiply(this._model, this._model, b.model);
    return this;
  }

  rotate(theta: number): Matrix {
    matrix3x2.rotate(this._model, this._model, theta);
    return this;
  }

  scale(sx: number, sy: number): Matrix {
    matrix3x2.scale(this._model, this._model, sx, sy);
    return this;
  }

  setGradientTransform(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setGradientTransform(this._model, width, height, rotation, tx, ty);
  }

  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    matrix3x2.setTo(this._model, a, b, c, d, tx, ty);
  }

  setTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setTransform(this._model, scaleX, scaleY, rotation, tx, ty);
  }

  transformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPoint(out, this._model, point.model);
    return out;
  }

  transformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPointXY(out, this._model, x, y);
    return out;
  }

  transformRect(source: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRect(out.model, this._model, source.model);
    return out;
  }

  transformRectVec2(a: Readonly<Vector2>, b: Readonly<Vector2>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectVec2(out.model, this._model, a.model, b.model);
    return out;
  }

  transformRectXY(ax: number, ay: number, bx: number, by: number): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectXY(out, this._model, ax, ay, bx, by);
    return out;
  }

  transformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVector(out.model, this._model, vector.model);
    return out;
  }

  transformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVectorXY(out.model, this._model, x, y);
    return out;
  }

  translate(dx: number, dy: number): Matrix {
    matrix3x2.translate(this._model, this._model, dx, dy);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this._model.a;
  }

  set a(value: number) {
    this._model.a = value;
  }

  get b(): number {
    return this._model.b;
  }

  set b(value: number) {
    this._model.b = value;
  }

  get c(): number {
    return this._model.c;
  }

  set c(value: number) {
    this._model.c = value;
  }

  get d(): number {
    return this._model.d;
  }

  set d(value: number) {
    this._model.d = value;
  }

  get model(): MatrixModel {
    return this._model;
  }

  get tx(): number {
    return this._model.tx;
  }

  set tx(value: number) {
    this._model.tx = value;
  }

  get ty(): number {
    return this._model.ty;
  }

  set ty(value: number) {
    this._model.ty = value;
  }
}
