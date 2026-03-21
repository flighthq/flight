import { vector2 } from '@flighthq/geometry';
import type { Vector2 as RawVector2 } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class Vector2 extends FlightObject<RawVector2> {
  constructor(x?: number, y?: number) {
    super();
    const raw = this.__raw;
    if (x !== undefined) raw.x = x;
    if (y !== undefined) raw.y = y;
  }

  protected override __create() {
    return vector2.create();
  }

  add(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.add(out.raw, this.__raw, source.raw);
    return out;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copyFrom(source: Readonly<Vector2>): void {
    vector2.copy(this.__raw, source.raw);
  }

  static createPolar(len: number, angle: number): Vector2 {
    const out = new Vector2();
    vector2.setPolar(out.raw, len, angle);
    return out;
  }

  static distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    return vector2.distance(a.raw, b.raw);
  }

  equals(b: Readonly<Vector2> | null | undefined): boolean {
    if (!b) return false;
    return vector2.equals(this.__raw, b.raw);
  }

  static fromRaw(raw: Readonly<RawVector2>): Vector2 {
    return FlightObject.getOrCreate(raw, Vector2)!;
  }

  static lerp(a: Readonly<Vector2>, b: Readonly<Vector2>, t: number): Vector2 {
    const out = new Vector2();
    vector2.lerp(out.raw, a.raw, b.raw, t);
    return out;
  }

  normalize(length: number): void {
    vector2.normalize(this.__raw, this.__raw, length);
  }

  offset(dx: number, dy: number): void {
    vector2.offset(this.__raw, this.__raw, dx, dy);
  }

  setTo(x: number, y: number): void {
    vector2.setTo(this.__raw, x, y);
  }

  subtract(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.subtract(out.raw, this.__raw, source.raw);
    return out;
  }

  // Get & Set Methods

  get length(): number {
    return vector2.length(this.__raw);
  }

  get lengthSquared(): number {
    return vector2.lengthSquared(this.__raw);
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
}
