import { vector2, vector3, vector4 } from '@flighthq/geometry';
import type { Vector4 as RawVector4 } from '@flighthq/types';

import FlightObject from '../FlightObject';
import type Vector2 from './Vector2';
import type Vector3 from './Vector3';

export default class Vector4 extends FlightObject<RawVector4> {
  constructor(x?: number, y?: number, z?: number, w?: number) {
    super();
    const raw = this.__raw;
    if (x !== undefined) raw.x = x;
    if (y !== undefined) raw.y = y;
    if (z !== undefined) raw.z = z;
    if (w !== undefined) raw.w = w;
  }

  protected override __create() {
    return vector4.create();
  }

  add(b: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.add(out.raw, this.__raw, b.raw);
    return out;
  }

  static angleBetween(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.angleBetween(a.raw, b.raw);
  }

  clone(): Vector4 {
    return Vector4.fromRaw(this.__raw);
  }

  copyFrom(source: Readonly<Vector4>): void {
    vector4.copy(this.__raw, source.raw);
  }

  cross(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector3.cross(out.raw, this.__raw, other.raw);
    out.w = 1;
    return out;
  }

  static distance(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distance(a.raw, b.raw);
  }

  distanceSquared(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
    return vector4.distanceSquared(a.raw, b.raw);
  }

  dot(b: Readonly<Vector4>): number {
    return vector4.dot(this.__raw, b.raw);
  }

  equals(b: Readonly<Vector4> | null | undefined): boolean {
    if (!b) return false;
    return vector4.equals(this.__raw, b.raw);
  }

  static fromRaw(raw: Readonly<RawVector4>): Vector4 {
    return FlightObject.getOrCreate(raw, Vector4)!;
  }

  static fromVector2(source: Readonly<Vector2>): Vector4 {
    const out = new Vector4();
    vector2.copy(out.raw, source.raw);
    out.w = 1;
    return out;
  }

  static fromVector3(raw: Readonly<Vector3>): Vector4 {
    const out = new Vector4();
    vector3.copy(out.raw, raw);
    out.w = 1;
    return out;
  }

  nearEquals(b: Readonly<Vector4>, tolerance: number = 1e-6): boolean {
    return vector4.nearEquals(this.__raw, b.raw, tolerance);
  }

  negate(): void {
    vector4.negate(this.__raw, this.__raw);
  }

  normalize(): number {
    return vector4.normalize(this.__raw, this.__raw);
  }

  project(): void {
    vector4.project(this.__raw, this.__raw);
  }

  scale(scalar: number): void {
    vector4.scale(this.__raw, this.__raw, scalar);
  }

  setTo(x: number, y: number, z: number, w: number): void {
    vector4.setTo(this.__raw, x, y, z, w);
  }

  subtract(other: Readonly<Vector4>): Vector4 {
    const out = new Vector4();
    vector4.subtract(out.raw, this.__raw, other.raw);
    return out;
  }

  // Get & Set Methods

  static get W_UNIT(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.raw, vector4.W_UNIT);
    return out;
  }

  static get X_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.raw, vector4.X_AXIS);
    return out;
  }

  static get Y_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.raw, vector4.Y_AXIS);
    return out;
  }

  static get Z_AXIS(): Vector4 {
    const out = new Vector4();
    vector4.copy(out.raw, vector4.Z_AXIS);
    return out;
  }

  get length(): number {
    return vector4.length(this.__raw);
  }

  get lengthSquared(): number {
    return vector4.lengthSquared(this.__raw);
  }

  get w(): number {
    return this.__raw.w;
  }

  set w(value: number) {
    this.__raw.w = value;
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
