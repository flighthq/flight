import { matrix3x2 } from '@flighthq/geometry';
import type { Matrix3x2 as RawMatrix } from '@flighthq/types';

import FlightObject from '../FlightObject';
import type Matrix3 from './Matrix3';
import type Matrix4 from './Matrix4';
import Rectangle from './Rectangle';
import Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Matrix extends FlightObject<RawMatrix> {
  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    super();
    if (a || b || c || d || tx || ty) {
      matrix3x2.setTo(this.__raw, a ?? 1, b ?? 0, c ?? 0, d ?? 1, tx ?? 0, ty ?? 0);
    }
  }

  protected override __create() {
    return matrix3x2.create();
  }

  clone(): Matrix {
    const m = new Matrix();
    matrix3x2.copy(m.__raw, this.__raw);
    return m;
  }

  concat(b: Readonly<Matrix>): Matrix {
    matrix3x2.concat(this.__raw, this.__raw, b);
    return this;
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x2.copyColumnFrom(this.__raw, column, source);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x2.copyColumnTo(target, column, this.__raw);
  }

  copyFrom(source: Readonly<Matrix>): void {
    matrix3x2.copy(this.__raw, source);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x2.copyRowFrom(this.__raw, row, source);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x2.copyRowTo(target, row, this.__raw);
  }

  static createGradientTransform(
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Matrix {
    const out = new Matrix();
    matrix3x2.setGradientTransform(out.raw, width, height, rotation, tx, ty);
    return out;
  }

  static createTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): Matrix {
    const out = new Matrix();
    matrix3x2.setTransform(out.raw, scaleX, scaleY, rotation, tx, ty);
    return out;
  }

  equals(b: Readonly<Matrix> | null | undefined, compareTranslation: boolean = true): boolean {
    return matrix3x2.equals(this.__raw, b, compareTranslation);
  }

  static fromMatrix3(source: Readonly<Matrix3>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix3x3(out.raw, source.raw);
    return out;
  }

  static fromMatrix4(source: Readonly<Matrix4>): Matrix {
    const out = new Matrix();
    matrix3x2.fromMatrix4x4(out.raw, source.raw);
    return out;
  }

  static fromRaw(raw: Readonly<RawMatrix>): Matrix {
    return FlightObject.getOrCreate(raw, Matrix)!;
  }

  identity(): Matrix {
    matrix3x2.identity(this.__raw);
    return this;
  }

  inverse(): Matrix {
    matrix3x2.inverse(this.__raw, this.__raw);
    return this;
  }

  inverseTransformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPoint(out.raw, this.__raw, point.raw);
    return out;
  }

  inverseTransformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformPointXY(out.raw, this.__raw, x, y);
    return out;
  }

  inverseTransformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVector(out.raw, this.__raw, vector.raw);
    return out;
  }

  inverseTransformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.inverseTransformVectorXY(out, this.__raw, x, y);
    return out;
  }

  multiply(b: Readonly<Matrix>): Matrix {
    matrix3x2.multiply(this.__raw, this.__raw, b.raw);
    return this;
  }

  rotate(theta: number): Matrix {
    matrix3x2.rotate(this.__raw, this.__raw, theta);
    return this;
  }

  scale(sx: number, sy: number): Matrix {
    matrix3x2.scale(this.__raw, this.__raw, sx, sy);
    return this;
  }

  setGradientTransform(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setGradientTransform(this.__raw, width, height, rotation, tx, ty);
  }

  setTo(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    matrix3x2.setTo(this.__raw, a, b, c, d, tx, ty);
  }

  setTransform(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    matrix3x2.setTransform(this.__raw, scaleX, scaleY, rotation, tx, ty);
  }

  transformPoint(point: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPoint(out, this.__raw, point.raw);
    return out;
  }

  transformPointXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformPointXY(out, this.__raw, x, y);
    return out;
  }

  transformRect(source: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRect(out.raw, this.__raw, source.raw);
    return out;
  }

  transformRectVec2(a: Readonly<Vector2>, b: Readonly<Vector2>): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectVec2(out.raw, this.__raw, a.raw, b.raw);
    return out;
  }

  transformRectXY(ax: number, ay: number, bx: number, by: number): Rectangle {
    const out = new Rectangle();
    matrix3x2.transformRectXY(out, this.__raw, ax, ay, bx, by);
    return out;
  }

  transformVector(vector: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVector(out.raw, this.__raw, vector.raw);
    return out;
  }

  transformVectorXY(x: number, y: number): Vector2 {
    const out = new Vector2();
    matrix3x2.transformVectorXY(out.raw, this.__raw, x, y);
    return out;
  }

  translate(dx: number, dy: number): Matrix {
    matrix3x2.translate(this.__raw, this.__raw, dx, dy);
    return this;
  }

  // Get & Set Methods

  get a(): number {
    return this.__raw.a;
  }

  set a(value: number) {
    this.__raw.a = value;
  }

  get b(): number {
    return this.__raw.b;
  }

  set b(value: number) {
    this.__raw.b = value;
  }

  get c(): number {
    return this.__raw.c;
  }

  set c(value: number) {
    this.__raw.c = value;
  }

  get d(): number {
    return this.__raw.d;
  }

  set d(value: number) {
    this.__raw.d = value;
  }

  get tx(): number {
    return this.__raw.tx;
  }

  set tx(value: number) {
    this.__raw.tx = value;
  }

  get ty(): number {
    return this.__raw.ty;
  }

  set ty(value: number) {
    this.__raw.ty = value;
  }
}
