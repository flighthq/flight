import { matrix3x3 } from '@flighthq/geometry';
import type { Matrix3x3 as Matrix3Model } from '@flighthq/types';

import type Matrix from './Matrix';
import type Matrix4 from './Matrix4';
import type Vector3 from './Vector3';

export default class Matrix3 {
  protected _model: Matrix3Model;

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
    this._model = matrix3x3.create(m00, m01, m02, m10, m11, m12, m20, m21, m22);
  }

  clone(): Matrix3 {
    return Matrix3.fromModel(this._model);
  }

  copyColumnFrom(column: number, source: Readonly<Vector3>): void {
    matrix3x3.copyColumnFrom(this._model, column, source.model);
  }

  copyColumnTo(column: number, target: Vector3): void {
    matrix3x3.copyColumnTo(target.model, column, this._model);
  }

  copyFrom(source: Readonly<Matrix3>): void {
    matrix3x3.copy(this._model, source.model);
  }

  copyRowFrom(row: number, source: Readonly<Vector3>): void {
    matrix3x3.copyRowFrom(this._model, row, source.model);
  }

  copyRowTo(row: number, target: Vector3): void {
    matrix3x3.copyRowTo(target.model, row, this._model);
  }

  equals(b: Readonly<Matrix3> | null | undefined): boolean {
    if (!b) return false;
    return matrix3x3.equals(this._model, b.model);
  }

  static fromMatrix(source: Readonly<Matrix>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix3x2(out.model, source.model);
    return out;
  }

  static fromMatrix4x4(source: Readonly<Matrix4>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.fromMatrix4x4(out.model, source.model);
    return out;
  }

  static fromModel(model: Readonly<Matrix3Model>): Matrix3 {
    const out = new Matrix3();
    matrix3x3.copy(out.model, model);
    return out;
  }

  get(row: number, column: number): number {
    return matrix3x3.get(this._model, row, column);
  }

  identity(): void {
    matrix3x3.identity(this._model);
  }

  inverse(): void {
    matrix3x3.inverse(this._model, this._model);
  }

  multiply(b: Readonly<Matrix3>): void {
    matrix3x3.multiply(this._model, this._model, b.model);
  }

  rotate(theta: number): void {
    matrix3x3.rotate(this._model, this._model, theta);
  }

  scale(sx: number, sy: number): void {
    matrix3x3.scale(this._model, this._model, sx, sy);
  }

  set(row: number, column: number, value: number): void {
    matrix3x3.set(this._model, row, column, value);
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
    matrix3x3.setTo(this._model, m00, m01, m02, m10, m11, m12, m20, m21, m22);
  }

  translate(tx: number, ty: number): void {
    matrix3x3.translate(this._model, this._model, tx, ty);
  }

  // Get & Set Methods

  get isAffine(): boolean {
    return matrix3x3.isAffine(this._model);
  }

  get model(): Matrix3Model {
    return this._model;
  }
}
