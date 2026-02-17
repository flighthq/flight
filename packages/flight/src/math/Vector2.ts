import { vector2 } from '@flighthq/math';
import type { Vector2 as Vector2Like } from '@flighthq/types';

export default class Vector2 implements Vector2Like {
  x: number = 0;
  y: number = 0;

  constructor(x?: number, y?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
  }

  add(source: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    vector2.add(out, this, source);
    return out;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  copyFrom(source: Readonly<Vector2Like>): void {
    vector2.copy(this, source);
  }

  static createPolar(len: number, angle: number): Vector2 {
    const out = new Vector2();
    this.setPolar(out, len, angle);
    return out;
  }

  static distance(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
    return vector2.distance(a, b);
  }

  equals(a: Readonly<Vector2Like> | null | undefined, b: Readonly<Vector2Like> | null | undefined): boolean {
    if (!a || !b) return false;
    return a === b || (a.x === b.x && a.y === b.y);
  }

  static length(source: Readonly<Vector2Like>): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2);
  }

  static lengthSquared(source: Readonly<Vector2Like>): number {
    return source.x ** 2 + source.y ** 2;
  }

  static lerp(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>, t: number): Vector2 {
    const out = new Vector2();
    vector2.lerp(out, a, b, t);
    return out;
  }

  normalize(length: number): void {
    vector2.normalize(this, this, length);
  }

  offset(dx: number, dy: number): void {
    vector2.offset(this, this, dx, dy);
  }

  setTo(x: number, y: number): void {
    vector2.setTo(this, x, y);
  }

  subtract(source: Readonly<Vector2Like>): Vector2 {
    const out = new Vector2();
    vector2.subtract(out, this, source);
    return out;
  }

  // Get & Set Methods

  get length(): number {
    return vector2.length(this);
  }

  get lengthSquared(): number {
    return vector2.lengthSquared(this);
  }
}
