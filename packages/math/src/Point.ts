import type { Point as PointLike } from '@flighthq/types';

/**
 * The Point object represents a location in a two-dimensional coordinate
 * system, where _x_ represents the horizontal axis and _y_
 * represents the vertical axis.
 *
 * Invariants:
 *
 * - `length = Math.sqrt(x ** 2 + y ** 2)`
 * - `length = x ** 2 + y ** 2`
 *
 * @see Rectangle
 * @see Matrix
 */
export default class Point implements PointLike {
  x: number = 0;
  y: number = 0;

  constructor(x?: number, y?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
  }

  static add(a: PointLike, b: PointLike): Point {
    return new Point(a.x + b.x, a.y + b.y);
  }

  static addTo(out: PointLike, a: PointLike, b: PointLike): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
  }

  static clone(source: PointLike): Point {
    return new Point(source.x, source.y);
  }

  static copyFrom(source: PointLike, out: PointLike): void {
    out.x = source.x;
    out.y = source.y;
  }

  static copyTo(out: PointLike, source: PointLike): void {
    out.x = source.x;
    out.y = source.y;
  }

  static distance(a: PointLike, b: PointLike): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static equals(a: PointLike, b: PointLike): boolean {
    return a === b || (a.x === b.x && a.y === b.y);
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   * @see lerp
   */
  static interpolate(end: PointLike, start: PointLike, t: number): Point {
    const out = new Point();
    this.lerp(out, start, end, t);
    return out;
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   */
  static interpolateTo(out: PointLike, end: PointLike, start: PointLike, t: number): void {
    this.lerp(out, start, end, t);
  }

  static length(source: PointLike): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2);
  }

  static lengthSquared(source: PointLike): number {
    return source.x ** 2 + source.y ** 2;
  }

  /**
   * Linear interpolation between points a and b
   */
  static lerp(out: PointLike, a: PointLike, b: PointLike, t: number): void {
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
  static normalize(target: PointLike, length: number): void {
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
  static normalizeTo(out: PointLike, source: PointLike, length: number): void {
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

  static offset(target: PointLike, dx: number, dy: number): void {
    target.x += dx;
    target.y += dy;
  }

  static offsetTo(out: PointLike, source: PointLike, dx: number, dy: number): void {
    out.x = source.x + dx;
    out.y += source.y + dy;
  }

  static polar(len: number, angle: number): Point {
    const out = new Point();
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
    return out;
  }

  static polarTo(out: PointLike, len: number, angle: number): void {
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
  }

  static setTo(out: PointLike, x: number, y: number): void {
    out.x = x;
    out.y = y;
  }

  static subtract(source: PointLike, toSubtract: PointLike): Point {
    const out = new Point();
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
    return out;
  }

  static subtractTo(out: PointLike, source: PointLike, toSubtract: PointLike): void {
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
  }

  toString(): string {
    return `(x=${this.x}, y=${this.y})`;
  }

  // Get & Set Methods

  get length(): number {
    return Point.length(this);
  }

  get lengthSquared(): number {
    return Point.lengthSquared(this);
  }
}
