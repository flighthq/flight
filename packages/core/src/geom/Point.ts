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

  static add(a: Point, b: Point, target?: Point): Point {
    target = target ?? new Point();
    target.x = a.x + b.x;
    target.y = a.y + b.y;
    return target;
  }

  static clone(source: Point): Point {
    return new Point(source.x, source.y);
  }

  static copyFrom(target: Point, source: Point): void {
    target.x = source.x;
    target.y = source.y;
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
   */
  static interpolate(end: Point, start: Point, t: number, target?: Point): Point {
    return Point.lerp(start, end, t, target);
  }

  /**
   * Interlinear interpolation between two points
   * @param a First point (t=0)
   * @param b Second point (t=1)
   * @param t Interpolation ratio
   * @returns new Point
   */
  static lerp(a: Point, b: Point, t: number, target?: Point): Point {
    target = target ?? new Point();
    target.x = a.x + t * (b.x - a.x);
    target.y = a.y + t * (b.y - a.y);
    return target;
  }

  /**
   * Returns a new point representing this vector scaled to a given length.
   *
   * The direction of the vector is preserved. If the original vector has zero length,
   * the returned point will also be (0, 0).
   *
   * @param length - The desired length of the vector. For example,
   *                 if the current point is (0, 5) and `length` is 1,
   *                 the returned point will be (0, 1).
   * @returns A new `Point` with the specified length in the same direction as this point.
   */
  static normalize(target: Point, length: number): Point {
    const currentLength = target.length;
    if (currentLength === 0) {
      target.x = 0;
      target.y = 0;
    } else {
      const scale = length / currentLength;
      target.x *= scale;
      target.y *= scale;
    }
    return target;
  }

  static offset(target: Point, dx: number, dy: number): void {
    target.x += dx;
    target.y += dy;
  }

  static polar(len: number, angle: number, target?: Point): Point {
    target = target ?? new Point();
    target.x = len * Math.cos(angle);
    target.y = len * Math.sin(angle);
    return target;
  }

  static setTo(target: Point, x: number, y: number): void {
    target.x = x;
    target.y = y;
  }

  static subtract(source: Point, toSubtract: Point, target?: Point): Point {
    target = target ?? new Point();
    target.x = source.x - toSubtract.x;
    target.y = source.y - toSubtract.y;
    return target;
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
