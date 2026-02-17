import { rectangle } from '@flighthq/math';
import type { Rectangle as RectangleLike, Vector2 as Vector2Like } from '@flighthq/types';

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

  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }

  contains(x: number, y: number): boolean {
    return rectangle.contains(this, x, y);
  }

  containsPoint(vector: Readonly<Vector2Like>): boolean {
    return rectangle.containsPoint(this, vector);
  }

  containsRect(other: Readonly<RectangleLike>): boolean {
    return rectangle.containsRect(this, other);
  }

  copyFrom(source: Readonly<RectangleLike>): void {
    rectangle.copy(this, source);
  }

  equals(b: Readonly<RectangleLike> | null | undefined): boolean {
    return rectangle.equals(this, b);
  }

  inflate(dx: number, dy: number): void {
    rectangle.inflate(this, this, dx, dy);
  }

  inflatePoint(sourceVec2: Readonly<Vector2Like>): void {
    rectangle.inflatePoint(this, this, sourceVec2);
  }

  static intersection(b: Readonly<RectangleLike>): Rectangle {
    const out = new Rectangle();
    rectangle.intersection(out, this, b);
    return out;
  }

  intersects(b: Readonly<RectangleLike>): boolean {
    return rectangle.intersects(this, b);
  }

  isEmpty(): boolean {
    return rectangle.isEmpty(this);
  }

  normalize(): void {
    rectangle.normalize(this, this);
  }

  offset(out: RectangleLike, source: Readonly<RectangleLike>, dx: number, dy: number): void {
    rectangle.offset(this, this, dx, dy);
  }

  offsetPoint(point: Readonly<Vector2Like>): void {
    rectangle.offsetPoint(this, this, point);
  }

  setEmpty(): void {
    rectangle.setEmpty(this);
  }

  setTo(x: number, y: number, width: number, height: number): void {
    rectangle.setTo(this, x, y, width, height);
  }

  /**
   * Sets a Vector2 object to width and height
   */

  static union(other: Readonly<RectangleLike>): Rectangle {
    const out = new Rectangle();
    rectangle.union(out, this, other);
    return out;
  }

  // Get & Set Methods

  get bottom(): number {
    return rectangle.bottom(this);
  }

  set bottom(value: number) {
    rectangle.setBottom(this, value);
  }

  get bottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.bottomRight(out, this);
    return out;
  }

  set bottomRight(value: Readonly<Vector2Like>) {
    rectangle.setBottomRight(this, value);
  }

  get isFlippedX(): boolean {
    return rectangle.isFlippedX(this);
  }

  get isFlippedY(): boolean {
    return rectangle.isFlippedY(this);
  }

  get left(): number {
    return rectangle.left(this);
  }

  set left(value: number) {
    rectangle.setLeft(this, value);
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return rectangle.minY(this);
  }

  get maxX(): number {
    return rectangle.maxX(this);
  }

  get maxY(): number {
    return rectangle.maxY(this);
  }

  get normalizedBottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedBottomRight(out, this);
    return out;
  }

  get normalizedTopLeft(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedTopLeft(out, this);
    return out;
  }

  get right(): number {
    return rectangle.right(this);
  }

  set right(value: number) {
    rectangle.setRight(this, value);
  }

  get size(): Vector2 {
    const out = new Vector2();
    rectangle.size(out, this);
    return out;
  }

  set size(value: Readonly<Vector2Like>) {
    rectangle.setSize(this, value);
  }

  get top(): number {
    return rectangle.top(this);
  }

  set top(value: number) {
    rectangle.setTop(this, value);
  }

  get topLeft(): Vector2 {
    const out = new Vector2();
    rectangle.topLeft(out, this);
    return out;
  }

  set topLeft(value: Readonly<Vector2Like>) {
    rectangle.setTopLeft(this, value);
  }
}
