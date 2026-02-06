import type { Rectangle as RectangleLike, Vector2 as Vector2Like } from '@flighthq/types';

/**
 * A Rectangle object is an area defined by its position, as indicated by its
 * top-left corner point(`x`, `y`) and by its `width` and its `height`.
 *
 * Invariants:
 *
 * - `bottom = y + height`
 * - `bottomRight = new Vector2(x + width, y + height)`
 * - `isFlippedX = width < 0`
 * - `isFlippedY = height < 0`
 * - `left = x`
 * - `maxX = Math.max(x, right)`
 * - `maxY = Math.max(y, bottom)`
 * - `minX = Math.min(x, right)`
 * - `minY = Math.min(y, bottom)`
 * - `normalizedTopLeft = new Vector2(minX, minY)`
 * - `normalizedBottomRight = new Vector2(maxX, maxY)`
 * - `right = x + width`
 * - `size = new Vector2(width, height)`
 * - `top = y`
 * - `topLeft = new Vector2(x, y)`
 *
 * All methods assume the rectangle is axis-aligned (no rotation).
 *
 * @see Vector2
 */
export default class Rectangle implements RectangleLike {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;

  constructor(x?: number, y?: number, width?: number, height?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    if (width !== undefined) this.width = width;
    if (height !== undefined) this.height = height;
  }

  static bottom(source: RectangleLike): number {
    return source.y + source.height;
  }

  /**
   * Returns new Vector2 object with bottom-right coordinates
   */
  static bottomRight(out: Vector2Like, source: RectangleLike): void {
    out.x = source.x + source.width;
    out.y = source.y + source.height;
  }

  static clone(source: RectangleLike): Rectangle {
    return new Rectangle(source.x, source.y, source.width, source.height);
  }

  static contains(source: RectangleLike, x: number, y: number): boolean {
    const x0 = Math.min(source.x, source.x + source.width);
    const x1 = Math.max(source.x, source.x + source.width);
    const y0 = Math.min(source.y, source.y + source.height);
    const y1 = Math.max(source.y, source.y + source.height);
    return x >= x0 && x < x1 && y >= y0 && y < y1;
  }

  static containsPoint(source: RectangleLike, vector: Vector2Like): boolean {
    return this.contains(source, vector.x, vector.y);
  }

  static containsRect(source: RectangleLike, other: RectangleLike): boolean {
    const sx0 = Math.min(source.x, source.x + source.width);
    const sx1 = Math.max(source.x, source.x + source.width);
    const sy0 = Math.min(source.y, source.y + source.height);
    const sy1 = Math.max(source.y, source.y + source.height);

    const ox0 = Math.min(other.x, other.x + other.width);
    const ox1 = Math.max(other.x, other.x + other.width);
    const oy0 = Math.min(other.y, other.y + other.height);
    const oy1 = Math.max(other.y, other.y + other.height);

    // A rectangle contains another if all corners are inside (exclusive right/bottom)
    return ox0 >= sx0 && oy0 >= sy0 && ox1 <= sx1 && oy1 <= sy1;
  }

  static copy(out: RectangleLike, source: RectangleLike): void {
    if (out !== source) {
      out.x = source.x;
      out.y = source.y;
      out.width = source.width;
      out.height = source.height;
    }
  }

  copyFrom(source: RectangleLike): Rectangle {
    this.x = source.x;
    this.y = source.y;
    this.width = source.width;
    this.height = source.height;
    return this;
  }

  static equals(a: RectangleLike | null | undefined, b: RectangleLike | null | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }

  static inflate(out: RectangleLike, source: RectangleLike, dx: number, dy: number): void {
    out.x = source.x - dx;
    out.width = source.width + dx * 2;
    out.y = source.y - dy;
    out.height = source.height + dy * 2;
  }

  static inflatePoint(out: RectangleLike, sourceRect: RectangleLike, sourceVec2: Vector2Like): void {
    this.inflate(out, sourceRect, sourceVec2.x, sourceVec2.y);
  }

  static intersection(out: RectangleLike, a: RectangleLike, b: RectangleLike): void {
    const x0 = Math.max(this.minX(a), this.minX(b));
    const x1 = Math.min(this.maxX(a), this.maxX(b));
    const y0 = Math.max(this.minY(a), this.minY(b));
    const y1 = Math.min(this.maxY(a), this.maxY(b));

    if (x1 <= x0 || y1 <= y0) {
      this.setEmpty(out);
      return;
    }

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
  }

  static intersects(a: RectangleLike, b: RectangleLike): boolean {
    return !(
      this.maxX(a) <= this.minX(b) ||
      this.minX(a) >= this.maxX(b) ||
      this.maxY(a) <= this.minY(b) ||
      this.minY(a) >= this.maxY(b)
    );
  }

  /**
   * Returns true if width or height is 0
   *
   * Note: Negative width or height is considered valid
   */
  static isEmpty(source: RectangleLike): boolean {
    return source.width === 0 || source.height === 0;
  }

  static isFlippedX(source: RectangleLike): boolean {
    return source.width < 0;
  }

  static isFlippedY(source: RectangleLike): boolean {
    return source.height < 0;
  }

  static minX(source: RectangleLike): number {
    return Math.min(source.x, source.x + source.width);
  }

  static minY(source: RectangleLike): number {
    return Math.min(source.y, source.y + source.height);
  }

  static maxX(source: RectangleLike): number {
    return Math.max(source.x, source.x + source.width);
  }

  static maxY(source: RectangleLike): number {
    return Math.max(source.y, source.y + source.height);
  }

  static normalized(out: RectangleLike, source: RectangleLike): void {
    const _minX = this.minX(source);
    const _minY = this.minY(source);
    out.x = _minX;
    out.y = _minY;
    out.width = this.maxX(source) - _minX;
    out.height = this.maxY(source) - _minY;
  }

  static normalizedBottomRight(out: Vector2Like, source: RectangleLike): void {
    out.x = this.maxX(source);
    out.y = this.maxY(source);
  }

  static normalizedTopLeft(out: Vector2Like, source: RectangleLike): void {
    out.x = this.minX(source);
    out.y = this.minY(source);
  }

  static offset(out: RectangleLike, target: RectangleLike, dx: number, dy: number): void {
    out.x = target.x + dx;
    out.y = target.y + dy;
  }

  static offsetPoint(out: Vector2Like, target: RectangleLike, point: Vector2Like): void {
    out.x = target.x + point.x;
    out.y = target.y + point.y;
  }

  static right(source: RectangleLike): number {
    return source.x + source.width;
  }

  static set(out: RectangleLike, x: number, y: number, width: number, height: number): void {
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
  }

  static setBottomRight(out: RectangleLike, source: RectangleLike, point: Vector2Like): void {
    out.width = point.x - source.x;
    out.height = point.y - source.y;
  }

  static setEmpty(out: RectangleLike): void {
    out.x = out.y = out.width = out.height = 0;
  }

  static setSize(out: RectangleLike, size: Vector2Like): void {
    out.width = size.x;
    out.height = size.y;
  }

  static setTopLeft(out: RectangleLike, point: Vector2Like): void {
    out.x = point.x;
    out.y = point.y;
  }

  /**
   * Sets a Vector2 object to width and height
   */
  static size(out: Vector2Like, source: Rectangle): void {
    out.x = source.width;
    out.y = source.height;
  }

  /**
   * Sets a Vector2 object with top-left coordinates
   */
  static topLeft(out: Vector2Like, source: RectangleLike): void {
    out.x = source.x;
    out.y = source.y;
  }

  static union(out: RectangleLike, source: RectangleLike, other: RectangleLike): void {
    const sourceLeft = Math.min(source.x, source.x + source.width);
    const sourceRight = Math.max(source.x, source.x + source.width);
    const sourceTop = Math.min(source.y, source.y + source.height);
    const sourceBottom = Math.max(source.y, source.y + source.height);

    const otherLeft = Math.min(other.x, other.x + other.width);
    const otherRight = Math.max(other.x, other.x + other.width);
    const otherTop = Math.min(other.y, other.y + other.height);
    const otherBottom = Math.max(other.y, other.y + other.height);

    const x0 = Math.min(sourceLeft, otherLeft);
    const x1 = Math.max(sourceRight, otherRight);
    const y0 = Math.min(sourceTop, otherTop);
    const y1 = Math.max(sourceBottom, otherBottom);

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
  }

  // Get & Set Methods

  get bottom(): number {
    return this.y + this.height;
  }

  get isFlippedX(): boolean {
    return this.width < 0;
  }
  get isFlippedY(): boolean {
    return this.height < 0;
  }

  get left(): number {
    return this.x;
  }

  set left(value: number) {
    this.width -= value - this.x;
    this.x = value;
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return Math.min(this.y, this.bottom);
  }

  get maxX(): number {
    return Math.max(this.x, this.right);
  }

  get maxY(): number {
    return Math.max(this.y, this.bottom);
  }

  get right(): number {
    return this.x + this.width;
  }

  set right(value: number) {
    this.width = value - this.x;
  }

  get top(): number {
    return this.y;
  }

  set top(value: number) {
    this.height -= value - this.y;
    this.y = value;
  }
}
