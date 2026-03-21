import { vector3 } from '@flighthq/geometry';
import type { Vector3 as RawVector3 } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class Vector3 extends FlightObject<RawVector3> {
  constructor(x?: number, y?: number, z?: number) {
    super();
    const raw = this.__raw;
    if (x !== undefined) raw.x = x;
    if (y !== undefined) raw.y = y;
    if (z !== undefined) raw.z = z;
  }

  protected override __create() {
    return vector3.create();
  }

  add(b: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.add(out, this.__raw, b.raw);
    return out;
  }

  static angleBetween(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.angleBetween(a.raw, b.raw);
  }

  clone(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.raw, this.__raw);
    return out;
  }

  copyFrom(source: Readonly<Vector3>): void {
    vector3.copy(this.__raw, source.raw);
  }

  cross(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.cross(out.raw, this.__raw, other.raw);
    return out;
  }

  static distance(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distance(a.raw, b.raw);
  }

  static distanceSquared(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
    return vector3.distanceSquared(a.raw, b.raw);
  }

  dot(b: Readonly<Vector3>): number {
    return vector3.dot(this.__raw, b.raw);
  }

  equals(b: Readonly<Vector3> | null | undefined): boolean {
    if (!b) return false;
    return vector3.equals(this.__raw, b.raw);
  }

  static fromRaw(raw: Readonly<RawVector3>): Vector3 {
    return FlightObject.getOrCreate(raw, Vector3)!;
  }

  nearEquals(b: Readonly<Vector3>, tolerance: number = 1e-6): boolean {
    return vector3.nearEquals(this.__raw, b.raw, tolerance);
  }

  negate(): void {
    vector3.negate(this.__raw, this.__raw);
  }

  normalize(): number {
    return vector3.normalize(this.__raw, this.__raw);
  }

  project(): void {
    vector3.project(this.__raw, this.__raw);
  }

  scale(scalar: number): void {
    vector3.scale(this.__raw, this.__raw, scalar);
  }

  setTo(x: number, y: number, z: number): void {
    vector3.setTo(this.__raw, x, y, z);
  }

  subtract(other: Readonly<Vector3>): Vector3 {
    const out = new Vector3();
    vector3.subtract(out.raw, this.__raw, other.raw);
    return out;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.raw, vector3.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.raw, vector3.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector3 {
    const out = new Vector3();
    vector3.copy(out.raw, vector3.Z_AXIS);
    return out;
  }

  get x(): number {
    return this.__raw.x;
  }

  set x(value: number) {
    this.__raw.x = value;
  }

  get y(): number {
    return this.__raw.y;
  }

  set y(value: number) {
    this.__raw.y = value;
  }

  get z(): number {
    return this.__raw.z;
  }

  set z(value: number) {
    this.__raw.z = value;
  }
}
