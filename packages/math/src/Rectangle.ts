import Point from './Point.js';

/**
 * A Rectangle object is an area defined by its position, as indicated by its
 * top-left corner point(`x`, `y`) and by its `width` and its `height`.
 *
 * Invariants:
 *
 * - `bottom = y + height`
 * - `bottomRight = new Point(x + width, y + height)`
 * - `isFlippedX = width < 0`
 * - `isFlippedY = height < 0`
 * - `left = x`
 * - `maxX = Math.max(x, right)`
 * - `maxY = Math.max(y, bottom)`
 * - `minX = Math.min(x, right)`
 * - `minY = Math.min(y, bottom)`
 * - `normalizedTopLeft = new Point(minX, minY)`
 * - `normalizedBottomRight = new Point(maxX, maxY)`
 * - `right = x + width`
 * - `size = new Point(width, height)`
 * - `top = y`
 * - `topLeft = new Point(x, y)`
 *
 * All methods assume the rectangle is axis-aligned (no rotation).
 *
 * @see Point
 */
export default class Rectangle {
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

  static clone(source: Rectangle): Rectangle {
    return new Rectangle(source.x, source.y, source.width, source.height);
  }

  static contains(source: Rectangle, x: number, y: number): boolean {
    const x0 = Math.min(source.x, source.right);
    const x1 = Math.max(source.x, source.right);
    const y0 = Math.min(source.y, source.bottom);
    const y1 = Math.max(source.y, source.bottom);
    return x >= x0 && x < x1 && y >= y0 && y < y1;
  }

  static containsPoint(source: Rectangle, point: Point): boolean {
    return this.contains(source, point.x, point.y);
  }

  static containsRect(source: Rectangle, other: Rectangle): boolean {
    const sx0 = Math.min(source.x, source.right);
    const sx1 = Math.max(source.x, source.right);
    const sy0 = Math.min(source.y, source.bottom);
    const sy1 = Math.max(source.y, source.bottom);

    const ox0 = Math.min(other.x, other.right);
    const ox1 = Math.max(other.x, other.right);
    const oy0 = Math.min(other.y, other.bottom);
    const oy1 = Math.max(other.y, other.bottom);

    // A rectangle contains another if all corners are inside (exclusive right/bottom)
    return ox0 >= sx0 && oy0 >= sy0 && ox1 <= sx1 && oy1 <= sy1;
  }

  static copyFrom(source: Rectangle, out: Rectangle): void {
    if (out !== source) {
      out.x = source.x;
      out.y = source.y;
      out.width = source.width;
      out.height = source.height;
    }
  }

  static copyTo(out: Rectangle, source: Rectangle): void {
    if (out !== source) {
      out.x = source.x;
      out.y = source.y;
      out.width = source.width;
      out.height = source.height;
    }
  }

  static equals(source: Rectangle, other: Rectangle): boolean {
    if (other === source) {
      return true;
    } else {
      return (
        source.x === other.x && source.y === other.y && source.width === other.width && source.height === other.height
      );
    }
  }

  static inflate(target: Rectangle, dx: number, dy: number): void {
    target.x -= dx;
    target.width += dx * 2;
    target.y -= dy;
    target.height += dy * 2;
  }

  static inflatePoint(target: Rectangle, point: Point): void {
    this.inflate(target, point.x, point.y);
  }

  static inflatePointTo(out: Rectangle, target: Rectangle, point: Point): void {
    this.inflateTo(out, target, point.x, point.y);
  }

  static inflateTo(out: Rectangle, source: Rectangle, dx: number, dy: number): void {
    out.x = source.x - dx;
    out.width = source.width + dx * 2;
    out.y = source.y - dy;
    out.height = source.height + dy * 2;
  }

  static intersection(a: Rectangle, b: Rectangle): Rectangle {
    const out = new Rectangle();
    this.intersectionTo(out, a, b);
    return out;
  }

  static intersectionTo(out: Rectangle, a: Rectangle, b: Rectangle): void {
    const x0 = Math.max(a.minX, b.minX);
    const x1 = Math.min(a.maxX, b.maxX);
    const y0 = Math.max(a.minY, b.minY);
    const y1 = Math.min(a.maxY, b.maxY);

    if (x1 <= x0 || y1 <= y0) {
      this.setEmpty(out);
      return;
    }

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
  }

  static intersects(a: Rectangle, b: Rectangle): boolean {
    return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY);
  }

  /**
   * Returns true if width or height is 0
   *
   * Note: Negative width or height is considered valid
   */
  static isEmpty(source: Rectangle): boolean {
    return source.width === 0 || source.height === 0;
  }

  static normalized(source: Rectangle): Rectangle {
    const out = new Rectangle();
    this.normalizedTo(out, source);
    return out;
  }

  static normalizedTo(out: Rectangle, source: Rectangle): void {
    const { minX, maxX, minY, maxY } = source;
    out.x = minX;
    out.y = minY;
    out.width = maxX - minX;
    out.height = maxY - minY;
  }

  static offset(target: Rectangle, dx: number, dy: number): void {
    target.x += dx;
    target.y += dy;
  }

  static offsetPoint(target: Rectangle, point: Point): void {
    target.x += point.x;
    target.y += point.y;
  }

  static offsetPointTo(out: Point, target: Rectangle, point: Point): void {
    out.x = target.x + point.x;
    out.y = target.y + point.y;
  }

  static offsetTo(out: Rectangle, target: Rectangle, dx: number, dy: number): void {
    out.x = target.x + dx;
    out.y = target.y + dy;
  }

  static setEmpty(out: Rectangle): void {
    out.x = out.y = out.width = out.height = 0;
  }

  static setTo(out: Rectangle, x: number, y: number, width: number, height: number): void {
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
  }

  toString(): string {
    return `(x=${this.x}, y=${this.y}, width=${this.width}, height=${this.height})`;
  }

  static union(source: Rectangle, other: Rectangle): Rectangle {
    const out = new Rectangle();
    this.unionTo(out, source, other);
    return out;
  }

  static unionTo(out: Rectangle, source: Rectangle, other: Rectangle): void {
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

  /**
   * Returns new Point object with bottom-right coordinates
   */
  get bottomRight(): Point {
    return new Point(this.x + this.width, this.y + this.height);
  }

  set bottomRight(value: Point) {
    this.width = value.x - this.x;
    this.height = value.y - this.y;
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

  get normalizedBottomRight(): Point {
    return new Point(this.maxX, this.maxY);
  }

  get normalizedTopLeft(): Point {
    return new Point(this.minX, this.minY);
  }

  get right(): number {
    return this.x + this.width;
  }

  set right(value: number) {
    this.width = value - this.x;
  }

  /**
   * Returns new Point object set to width and height
   */
  get size(): Point {
    return new Point(this.width, this.height);
  }

  set size(value: Point) {
    this.width = value.x;
    this.height = value.y;
  }

  get top(): number {
    return this.y;
  }

  set top(value: number) {
    this.height -= value - this.y;
    this.y = value;
  }

  /**
   * Returns new Point object with top-left coordinates
   */
  get topLeft(): Point {
    return new Point(this.x, this.y);
  }

  set topLeft(value: Point) {
    this.x = value.x;
    this.y = value.y;
  }
}
