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
export default class Point {
  x: number = 0;
  y: number = 0;

  constructor(x?: number, y?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
  }

  static add(a: Point, b: Point): Point {
    return new Point(a.x + b.x, a.y + b.y);
  }

  static addTo(out: Point, a: Point, b: Point): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
  }

  static clone(source: Point): Point {
    return new Point(source.x, source.y);
  }

  static copyFrom(source: Point, out: Point): void {
    out.x = source.x;
    out.y = source.y;
  }

  static copyTo(out: Point, source: Point): void {
    out.x = source.x;
    out.y = source.y;
  }

  static distance(a: Point, b: Point): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static equals(a: Point, b: Point): boolean {
    return a === b || (a.x === b.x && a.y === b.y);
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   * @see lerp
   */
  static interpolate(end: Point, start: Point, t: number): Point {
    const out = new Point();
    this.lerp(out, start, end, t);
    return out;
  }

  /**
   * @legacy Like lerp, except argument order is reversed
   */
  static interpolateTo(out: Point, end: Point, start: Point, t: number): void {
    this.lerp(out, start, end, t);
  }

  /**
   * Linear interpolation between points a and b
   */
  static lerp(out: Point, a: Point, b: Point, t: number): void {
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
  static normalize(target: Point, length: number): void {
    const currentLength = target.length;
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
  static normalizeTo(out: Point, source: Point, length: number): void {
    const currentLength = source.length;
    if (currentLength === 0) {
      out.x = 0;
      out.y = 0;
    } else {
      const scale = length / currentLength;
      out.x = source.x * scale;
      out.y = source.y * scale;
    }
  }

  static offset(target: Point, dx: number, dy: number): void {
    target.x += dx;
    target.y += dy;
  }

  static offsetTo(out: Point, source: Point, dx: number, dy: number): void {
    out.x = source.x + dx;
    out.y += source.y + dy;
  }

  static polar(len: number, angle: number): Point {
    const out = new Point();
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
    return out;
  }

  static polarTo(out: Point, len: number, angle: number): void {
    out.x = len * Math.cos(angle);
    out.y = len * Math.sin(angle);
  }

  static setTo(out: Point, x: number, y: number): void {
    out.x = x;
    out.y = y;
  }

  static subtract(source: Point, toSubtract: Point): Point {
    const out = new Point();
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
    return out;
  }

  static subtractTo(out: Point, source: Point, toSubtract: Point): void {
    out.x = source.x - toSubtract.x;
    out.y = source.y - toSubtract.y;
  }

  toString(): string {
    return `(x=${this.x}, y=${this.y})`;
  }

  // Get & Set Methods

  get length(): number {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }

  get lengthSquared(): number {
    return this.x ** 2 + this.y ** 2;
  }
}
