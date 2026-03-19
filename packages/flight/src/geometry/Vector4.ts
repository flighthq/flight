import { vector2, vector3, vector4 } from '@flighthq/geometry';
import type { Vector4 as Vector4Type } from '@flighthq/types';

import type Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Vector4 {
  public readonly value: Vector4Type;

  constructor(x?: number, y?: number, z?: number, w?: number) {
    this.value = vector4.create(x, y, z, w);
  }

  add(b: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.add(out.value, this.value, b.value);
    return out;
  }

  static angleBetween(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.angleBetween(a.value, b.value);
  }

  clone(): Vector4 {
    return Vector4.fromType(this.value);
  }

  copyFrom(source: Readonly<Vector4>): void {
    vector4.copy(this.value, source.value);
  }

  cross(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector3.cross(out.value, this.value, other.value);
    out.w = 1;
    return out;
  }

  static distance(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distance(a.value, b.value);
  }

  distanceSquared(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distanceSquared(a.value, b.value);
  }

  dot(b: Readonly<Vector4>): number {
    return vector4.dot(this.value, b.value);
  }

  equals(b: Readonly<Vector4> | null | undefined): boolean {
    if (!b) return false;
    return vector4.equals(this.value, b.value);
  }

  static fromType(value: Readonly<Vector4Type>): Vector4 {
    const out = new Vector4();
    vector4.copy(out.value, value);
    return out;
  }

  static fromVector2(source: Readonly<Vector2>): Vector4 {
    const out = new Vector4();
    vector2.copy(out.value, source.value);
    out.w = 1;
    return out;
  }

  static fromVector3(value: Readonly<Vector3>): Vector4 {
    const out = new Vector4();
    vector3.copy(out.value, value);
    out.w = 1;
    return out;
  }

  nearEquals(b: Readonly<Vector4>, tolerance: number = 1e-6): boolean {
    return vector4.nearEquals(this.value, b.value, tolerance);
  }

  negate(): void {
    vector4.negate(this.value, this.value);
  }

  normalize(): number {
    return vector4.normalize(this.value, this.value);
  }

  project(): void {
    vector4.project(this.value, this.value);
  }

  scale(scalar: number): void {
    vector4.scale(this.value, this.value, scalar);
  }

  setTo(x: number, y: number, z: number, w: number): void {
    vector4.setTo(this.value, x, y, z, w);
  }

  subtract(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.subtract(out.value, this.value, other.value);
    return out;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.value, vector4.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.value, vector4.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.value, vector4.Z_AXIS);
    return out;
  }

  get length(): number {
    return vector4.length(this.value);
  }

  get lengthSquared(): number {
    return vector4.lengthSquared(this.value);
  }

  get w(): number {
    return this.value.w;
  }

  set w(value: number) {
    this.value.w = value;
  }

  get x(): number {
    return this.value.x;
  }

  set x(value: number) {
    this.value.x = value;
  }

  get y(): number {
    return this.value.y;
  }

  set y(value: number) {
    this.value.y = value;
  }

  get z(): number {
    return this.value.z;
  }

  set z(value: number) {
    this.value.z = value;
  }
}
