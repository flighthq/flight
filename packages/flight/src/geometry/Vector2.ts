import { vector2 } from '@flighthq/geometry';
import type { Vector2 as Vector2Type } from '@flighthq/types';

export default class Vector2 {
  public readonly value: Vector2Type;

  constructor(x?: number, y?: number) {
    this.value = vector2.create(x, y);
  }

  add(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.add(out.value, this.value, source.value);
    return out;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copyFrom(source: Readonly<Vector2>): void {
    vector2.copy(this.value, source.value);
  }

  static createPolar(len: number, angle: number): Vector2 {
    const out = new Vector2();
    vector2.setPolar(out.value, len, angle);
    return out;
  }

  static distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
    return vector2.distance(a.value, b.value);
  }

  equals(b: Readonly<Vector2> | null | undefined): boolean {
    if (!b) return false;
    return vector2.equals(this.value, b.value);
  }

  static fromType(value: Readonly<Vector2Type>): Vector2 {
    const out = new Vector2();
    vector2.copy(out.value, value);
    return out;
  }

  static lerp(a: Readonly<Vector2>, b: Readonly<Vector2>, t: number): Vector2 {
    const out = new Vector2();
    vector2.lerp(out.value, a.value, b.value, t);
    return out;
  }

  normalize(length: number): void {
    vector2.normalize(this.value, this.value, length);
  }

  offset(dx: number, dy: number): void {
    vector2.offset(this.value, this.value, dx, dy);
  }

  setTo(x: number, y: number): void {
    vector2.setTo(this.value, x, y);
  }

  subtract(source: Readonly<Vector2>): Vector2 {
    const out = new Vector2();
    vector2.subtract(out.value, this.value, source.value);
    return out;
  }

  // Get & Set Methods

  get length(): number {
    return vector2.length(this.value);
  }

  get lengthSquared(): number {
    return vector2.lengthSquared(this.value);
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
}
