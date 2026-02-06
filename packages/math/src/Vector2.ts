import type { Vector2 as Vector2Like } from '@flighthq/types';

/**
 * The Vector2 object represents a location in a two-dimensional coordinate
 * system, where _x_ represents the horizontal axis and _y_
 * represents the vertical axis.
 *
 * Invariants:
 *
 * - `length = Math.sqrt(x ** 2 + y ** 2)`
 * - `lengthSquared = x ** 2 + y ** 2`
 *
 * @see Rectangle
 * @see Affine2D
 */
export default class Vector2 implements Vector2Like {
  x: number = 0;
  y: number = 0;

  constructor(x?: number, y?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
  }

  static add(a: Vector2Like, b: Vector2Like): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  static addTo(out: Vector2Like, a: Vector2Like, b: Vector2Like): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
  }

  static clone(source: Vector2Like): Vector2 {
    return new Vector2(source.x, source.y);
  }

  static copyFrom(source: Vector2Like, out: Vector2Like): void {
    out.x = source.x;
    out.y = source.y;
  }

  static copyTo(out: Vector2Like, source: Vector2Like): void {
    out.x = source.x;
    out.y = source.y;
  }

  static distance(a: Vector2Like, b: Vector2Like): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static equals(a: Vector2Like, b: Vector2Like): boolean {
    return a === b || (a.x === b.x && a.y === b.y);
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   * @see lerp
   */
  static interpolate(end: Vector2Like, start: Vector2Like, t: number): Vector2 {
    const out = new Vector2();
    this.lerp(out, start, end, t);
    return out;
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   */
  static interpolateTo(out: Vector2Like, end: Vector2Like, start: Vector2Like, t: number): void {
    this.lerp(out, start, end, t);
  }

  static length(source: Vector2Like): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2);
  }

  static lengthSquared(source: Vector2Like): number {
    return source.x ** 2 + source.y ** 2;
  }

  /**
   * Linear interpolation between points a and b
   */
  static lerp(out: Vector2Like, a: Vector2Like, b: Vector2Like, t: number): void {
    out.x = a.x + t * (b.x - a.x);
    out.y = a.y + t * (b.y - a.y);
  }

  /**
   * Modifies a point representing this vector scaled to a given length.
   *
   * The direction of the vector is preserved. If the original vector has zero length,
   * the returned point will also be (0, 0).
   *
   * @param length - The desired length of the vector. For example,
   *                 if the current point is (0, 5) and `length` is 1,
   *                 the returned point will be (0, 1).
   */
  static normalize(target: Vector2Like, length: number): void {
    const currentLength = this.length(target);
    if (currentLength === 0) {
      target.x = 0;
      target.y = 0;
    } else {
      const scale = length / currentLength;
      target.x *= scale;
      target.y *= scale;
    }
  }

  /**
   * Writes a point representing this vector scaled to a given length.
   *
   * The direction of the vector is preserved. If the original vector has zero length,
   * the returned point will also be (0, 0).
   */
  static normalizeTo(out: Vector2Like, source: Vector2Like, length: number): void {
    const currentLength = this.length(source);
    if (currentLength === 0) {
      out.x = 0;
      out.y = 0;
    } else {
      const scale = length / currentLength;
      out.x = source.x * scale;
      out.y = source.y * scale;
    }
  }

  static offset(target: Vector2Like, dx: number, dy: number): void {
    target.x += dx;
    target.y += dy;
  }

  static offsetTo(out: Vector2Like, source: Vector2Like, dx: number, dy: number): void {
    out.x = source.x + dx;
    out.y = source.y + dy;
  }

  static polar(len: number, angle: number): Vector2 {
    const out = new Vector2();
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
    return out;
  }

  static polarTo(out: Vector2Like, len: number, angle: number): void {
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
  }

  static setTo(out: Vector2Like, x: number, y: number): void {
    out.x = x;
    out.y = y;
  }

  static subtract(source: Vector2Like, toSubtract: Vector2Like): Vector2 {
    const out = new Vector2();
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
    return out;
  }

  static subtractTo(out: Vector2Like, source: Vector2Like, toSubtract: Vector2Like): void {
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
  }

  // Get & Set Methods

  get length(): number {
    return Vector2.length(this);
  }

  get lengthSquared(): number {
    return Vector2.lengthSquared(this);
  }
}
