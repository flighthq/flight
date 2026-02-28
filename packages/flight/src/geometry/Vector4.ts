import { vector2, vector3, vector4 } from '@flighthq/geometry';
import type { Vector4 as Vector4Model } from '@flighthq/types';

import type Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Vector4 {
  public readonly model: Vector4Model;

  constructor(x?: number, y?: number, z?: number, w?: number) {
    this.model = vector4.create(x, y, z, w);
  }

  add(b: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.add(out.model, this.model, b.model);
    return out;
  }

  static angleBetween(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.angleBetween(a.model, b.model);
  }

  clone(): Vector4 {
    return Vector4.fromModel(this.model);
  }

  copyFrom(source: Readonly<Vector4>): void {
    vector4.copy(this.model, source.model);
  }

  cross(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector3.cross(out.model, this.model, other.model);
    out.w = 1;
    return out;
  }

  static distance(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distance(a.model, b.model);
  }

  distanceSquared(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distanceSquared(a.model, b.model);
  }

  dot(b: Readonly<Vector4>): number {
    return vector4.dot(this.model, b.model);
  }

  equals(b: Readonly<Vector4> | null | undefined): boolean {
    if (!b) return false;
    return vector4.equals(this.model, b.model);
  }

  static fromModel(model: Readonly<Vector4Model>): Vector4 {
    const out = new Vector4();
    vector4.copy(out.model, model);
    return out;
  }

  static fromVector2(source: Readonly<Vector2>): Vector4 {
    const out = new Vector4();
    vector2.copy(out.model, source.model);
    out.w = 1;
    return out;
  }

  static fromVector3(model: Readonly<Vector3>): Vector4 {
    const out = new Vector4();
    vector3.copy(out.model, model);
    out.w = 1;
    return out;
  }

  nearEquals(b: Readonly<Vector4>, tolerance: number = 1e-6): boolean {
    return vector4.nearEquals(this.model, b.model, tolerance);
  }

  negate(): void {
    vector4.negate(this.model, this.model);
  }

  normalize(): number {
    return vector4.normalize(this.model, this.model);
  }

  project(): void {
    vector4.project(this.model, this.model);
  }

  scale(scalar: number): void {
    vector4.scale(this.model, this.model, scalar);
  }

  setTo(x: number, y: number, z: number, w: number): void {
    vector4.setTo(this.model, x, y, z, w);
  }

  subtract(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.subtract(out.model, this.model, other.model);
    return out;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.model, vector4.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.model, vector4.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.model, vector4.Z_AXIS);
    return out;
  }

  get length(): number {
    return vector4.length(this.model);
  }

  get lengthSquared(): number {
    return vector4.lengthSquared(this.model);
  }

  get w(): number {
    return this.model.w;
  }

  set w(value: number) {
    this.model.w = value;
  }

  get x(): number {
    return this.model.x;
  }

  set x(value: number) {
    this.model.x = value;
  }

  get y(): number {
    return this.model.y;
  }

  set y(value: number) {
    this.model.y = value;
  }

  get z(): number {
    return this.model.z;
  }

  set z(value: number) {
    this.model.z = value;
  }
}
