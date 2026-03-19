import { vector2 } from '@flighthq/geometry';
import type { Vector2 as Vector2Model } from '@flighthq/types';

export default class Vector2 {
  protected _model: Vector2Model;

  constructor(x?: number, y?: number) {
    this._model = vector2.create(x, y);
  }

  add(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.add(out.model, this._model, source.model);
    return out;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copyFrom(source: Readonly<Vector2>): void {
    vector2.copy(this._model, source.model);
  }

  static createPolar(len: number, angle: number): Vector2 {
    const out = new Vector2();
    vector2.setPolar(out.model, len, angle);
    return out;
  }

  static distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    return vector2.distance(a.model, b.model);
  }

  equals(b: Readonly<Vector2> | null | undefined): boolean {
    if (!b) return false;
    return vector2.equals(this._model, b.model);
  }

  static fromModel(model: Readonly<Vector2Model>): Vector2 {
    const out = new Vector2();
    vector2.copy(out.model, model);
    return out;
  }

  static lerp(a: Readonly<Vector2>, b: Readonly<Vector2>, t: number): Vector2 {
    const out = new Vector2();
    vector2.lerp(out.model, a.model, b.model, t);
    return out;
  }

  normalize(length: number): void {
    vector2.normalize(this._model, this._model, length);
  }

  offset(dx: number, dy: number): void {
    vector2.offset(this._model, this._model, dx, dy);
  }

  setTo(x: number, y: number): void {
    vector2.setTo(this._model, x, y);
  }

  subtract(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.subtract(out.model, this._model, source.model);
    return out;
  }

  // Get & Set Methods

  get length(): number {
    return vector2.length(this._model);
  }

  get lengthSquared(): number {
    return vector2.lengthSquared(this._model);
  }

  get model(): Vector2Model {
    return this._model;
  }

  get x(): number {
    return this._model.x;
  }

  set x(value: number) {
    this._model.x = value;
  }

  get y(): number {
    return this._model.y;
  }

  set y(value: number) {
    this._model.y = value;
  }
}
