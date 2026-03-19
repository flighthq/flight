import { vector3 } from '@flighthq/geometry';
import type { Vector3 as Vector3Type } from '@flighthq/types';

export default class Vector3 {
  public readonly value: Vector3Type;

  constructor(x?: number, y?: number, z?: number) {
    this.value = vector3.create(x, y, z);
  }

  add(b: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.add(out, this.value, b.value);
    return out;
  }

  static angleBetween(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.angleBetween(a.value, b.value);
  }

  clone(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.value, this.value);
    return out;
  }

  copyFrom(source: Readonly<Vector3>): void {
    vector3.copy(this.value, source.value);
  }

  cross(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.cross(out.value, this.value, other.value);
    return out;
  }

  static distance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distance(a.value, b.value);
  }

  static distanceSquared(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distanceSquared(a.value, b.value);
  }

  dot(b: Readonly<Vector3>): number {
    return vector3.dot(this.value, b.value);
  }

  equals(b: Readonly<Vector3> | null | undefined): boolean {
    if (!b) return false;
    return vector3.equals(this.value, b.value);
  }

  nearEquals(b: Readonly<Vector3>, tolerance: number = 1e-6): boolean {
    return vector3.nearEquals(this.value, b.value, tolerance);
  }

  negate(): void {
    vector3.negate(this.value, this.value);
  }

  normalize(): number {
    return vector3.normalize(this.value, this.value);
  }

  project(): void {
    vector3.project(this.value, this.value);
  }

  scale(scalar: number): void {
    vector3.scale(this.value, this.value, scalar);
  }

  setTo(x: number, y: number, z: number): void {
    vector3.setTo(this.value, x, y, z);
  }

  subtract(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.subtract(out.value, this.value, other.value);
    return out;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.value, vector3.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.value, vector3.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.value, vector3.Z_AXIS);
    return out;
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
