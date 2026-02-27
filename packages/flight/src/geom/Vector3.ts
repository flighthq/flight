import { vector3 } from '@flighthq/geom';
import type { Vector3 as Vector3Model } from '@flighthq/types';

export default class Vector3 {
  public readonly model: Vector3Model;

  constructor(x?: number, y?: number, z?: number) {
    this.model = vector3.create(x, y, z);
  }

  add(b: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.add(out, this.model, b.model);
    return out;
  }

  static angleBetween(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.angleBetween(a.model, b.model);
  }

  clone(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.model, this.model);
    return out;
  }

  copyFrom(source: Readonly<Vector3>): void {
    vector3.copy(this.model, source.model);
  }

  cross(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.cross(out.model, this.model, other.model);
    return out;
  }

  static distance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distance(a.model, b.model);
  }

  static distanceSquared(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distanceSquared(a.model, b.model);
  }

  dot(b: Readonly<Vector3>): number {
    return vector3.dot(this.model, b.model);
  }

  equals(b: Readonly<Vector3> | null | undefined): boolean {
    if (!b) return false;
    return vector3.equals(this.model, b.model);
  }

  nearEquals(b: Readonly<Vector3>, tolerance: number = 1e-6): boolean {
    return vector3.nearEquals(this.model, b.model, tolerance);
  }

  negate(): void {
    vector3.negate(this.model, this.model);
  }

  normalize(): number {
    return vector3.normalize(this.model, this.model);
  }

  project(): void {
    vector3.project(this.model, this.model);
  }

  scale(scalar: number): void {
    vector3.scale(this.model, this.model, scalar);
  }

  setTo(x: number, y: number, z: number): void {
    vector3.setTo(this.model, x, y, z);
  }

  subtract(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.subtract(out.model, this.model, other.model);
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
