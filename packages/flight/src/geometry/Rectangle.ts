import { rectangle } from '@flighthq/geometry';
import type { Rectangle as RectangleType } from '@flighthq/types';

import Vector2 from './Vector2.js';

export default class Rectangle {
  public readonly value: RectangleType;

  constructor(x?: number, y?: number, width?: number, height?: number) {
    this.value = rectangle.create(x, y, width, height);
  }

  clone(): Rectangle {
    return Rectangle.fromType(this.value);
  }

  contains(x: number, y: number): boolean {
    return rectangle.contains(this.value, x, y);
  }

  containsPoint(vector: Readonly<Vector2>): boolean {
    return rectangle.containsPoint(this.value, vector.value);
  }

  containsRect(other: Readonly<Rectangle>): boolean {
    return rectangle.containsRect(this.value, other.value);
  }

  copyFrom(source: Readonly<Rectangle>): void {
    rectangle.copy(this.value, source.value);
  }

  equals(b: Readonly<Rectangle> | null | undefined): boolean {
    if (!b) return false;
    return rectangle.equals(this.value, b.value);
  }

  static fromType(value: Readonly<RectangleType>): Rectangle {
    const out = new Rectangle();
    rectangle.copy(out.value, value);
    return out;
  }

  inflate(dx: number, dy: number): void {
    rectangle.inflate(this.value, this.value, dx, dy);
  }

  inflatePoint(sourceVec2: Readonly<Vector2>): void {
    rectangle.inflatePoint(this.value, this.value, sourceVec2.value);
  }

  intersection(b: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.intersection(out.value, this.value, b);
    return out;
  }

  intersects(b: Readonly<Rectangle>): boolean {
    return rectangle.intersects(this.value, b.value);
  }

  isEmpty(): boolean {
    return rectangle.isEmpty(this.value);
  }

  normalize(): void {
    rectangle.normalize(this.value, this.value);
  }

  offset(dx: number, dy: number): void {
    rectangle.offset(this.value, this.value, dx, dy);
  }

  offsetPoint(point: Readonly<Vector2>): void {
    rectangle.offsetPoint(this.value, this.value, point.value);
  }

  setEmpty(): void {
    rectangle.setEmpty(this.value);
  }

  setTo(x: number, y: number, width: number, height: number): void {
    rectangle.setTo(this.value, x, y, width, height);
  }

  /**
   * Sets a Vector2 object to width and height
   */

  union(other: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.union(out.value, this.value, other.value);
    return out;
  }

  // Get & Set Methods

  get bottom(): number {
    return rectangle.bottom(this.value);
  }

  set bottom(value: number) {
    rectangle.setBottom(this.value, value);
  }

  get bottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.bottomRight(out.value, this.value);
    return out;
  }

  set bottomRight(value: Readonly<Vector2>) {
    rectangle.setBottomRight(this.value, value.value);
  }

  get height(): number {
    return this.value.height;
  }

  set height(value: number) {
    this.value.height = value;
  }

  get isFlippedX(): boolean {
    return rectangle.isFlippedX(this.value);
  }

  get isFlippedY(): boolean {
    return rectangle.isFlippedY(this.value);
  }

  get left(): number {
    return rectangle.left(this.value);
  }

  set left(value: number) {
    rectangle.setLeft(this.value, value);
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return rectangle.minY(this.value);
  }

  get maxX(): number {
    return rectangle.maxX(this.value);
  }

  get maxY(): number {
    return rectangle.maxY(this.value);
  }

  get normalizedBottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedBottomRight(out.value, this.value);
    return out;
  }

  get normalizedTopLeft(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedTopLeft(out.value, this.value);
    return out;
  }

  get right(): number {
    return rectangle.right(this.value);
  }

  set right(value: number) {
    rectangle.setRight(this.value, value);
  }

  get size(): Vector2 {
    const out = new Vector2();
    rectangle.size(out.value, this.value);
    return out;
  }

  set size(value: Readonly<Vector2>) {
    rectangle.setSize(this.value, value);
  }

  get top(): number {
    return rectangle.top(this.value);
  }

  set top(value: number) {
    rectangle.setTop(this.value, value);
  }

  get topLeft(): Vector2 {
    const out = new Vector2();
    rectangle.topLeft(out.value, this.value);
    return out;
  }

  set topLeft(value: Readonly<Vector2>) {
    rectangle.setTopLeft(this.value, value);
  }

  get width(): number {
    return this.value.width;
  }

  set width(value: number) {
    this.value.width = value;
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
