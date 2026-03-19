import { vector3 } from '@flighthq/geometry';
import type { Vector3 as Vector3Model } from '@flighthq/types';

export default class Vector3 {
  protected _model: Vector3Model;

  constructor(x?: number, y?: number, z?: number) {
    this._model = vector3.create(x, y, z);
  }

  add(b: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.add(out, this._model, b.model);
    return out;
  }

  static angleBetween(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.angleBetween(a.model, b.model);
  }

  clone(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.model, this._model);
    return out;
  }

  copyFrom(source: Readonly<Vector3>): void {
    vector3.copy(this._model, source.model);
  }

  cross(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.cross(out.model, this._model, other.model);
    return out;
  }

  static distance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distance(a.model, b.model);
  }

  static distanceSquared(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distanceSquared(a.model, b.model);
  }

  dot(b: Readonly<Vector3>): number {
    return vector3.dot(this._model, b.model);
  }

  equals(b: Readonly<Vector3> | null | undefined): boolean {
    if (!b) return false;
    return vector3.equals(this._model, b.model);
  }

  nearEquals(b: Readonly<Vector3>, tolerance: number = 1e-6): boolean {
    return vector3.nearEquals(this._model, b.model, tolerance);
  }

  negate(): void {
    vector3.negate(this._model, this._model);
  }

  normalize(): number {
    return vector3.normalize(this._model, this._model);
  }

  project(): void {
    vector3.project(this._model, this._model);
  }

  scale(scalar: number): void {
    vector3.scale(this._model, this._model, scalar);
  }

  setTo(x: number, y: number, z: number): void {
    vector3.setTo(this._model, x, y, z);
  }

  subtract(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.subtract(out.model, this._model, other.model);
    return out;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.model, vector3.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.model, vector3.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.model, vector3.Z_AXIS);
    return out;
  }

  get model(): Vector3Model {
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

  get z(): number {
    return this._model.z;
  }

  set z(value: number) {
    this._model.z = value;
  }
}
