import { rectangle } from '@flighthq/geom';
import type { Rectangle as RectangleModel } from '@flighthq/types';

import Vector2 from './Vector2.js';

export default class Rectangle {
  public readonly model: RectangleModel;

  constructor(x?: number, y?: number, width?: number, height?: number) {
    this.model = rectangle.create(x, y, width, height);
  }

  clone(): Rectangle {
    return Rectangle.fromModel(this.model);
  }

  contains(x: number, y: number): boolean {
    return rectangle.contains(this.model, x, y);
  }

  containsPoint(vector: Readonly<Vector2>): boolean {
    return rectangle.containsPoint(this.model, vector.model);
  }

  containsRect(other: Readonly<Rectangle>): boolean {
    return rectangle.containsRect(this.model, other.model);
  }

  copyFrom(source: Readonly<Rectangle>): void {
    rectangle.copy(this.model, source.model);
  }

  equals(b: Readonly<Rectangle> | null | undefined): boolean {
    if (!b) return false;
    return rectangle.equals(this.model, b.model);
  }

  static fromModel(model: Readonly<RectangleModel>): Rectangle {
    const out = new Rectangle();
    rectangle.copy(out.model, model);
    return out;
  }

  inflate(dx: number, dy: number): void {
    rectangle.inflate(this.model, this.model, dx, dy);
  }

  inflatePoint(sourceVec2: Readonly<Vector2>): void {
    rectangle.inflatePoint(this.model, this.model, sourceVec2.model);
  }

  intersection(b: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.intersection(out.model, this.model, b);
    return out;
  }

  intersects(b: Readonly<Rectangle>): boolean {
    return rectangle.intersects(this.model, b.model);
  }

  isEmpty(): boolean {
    return rectangle.isEmpty(this.model);
  }

  normalize(): void {
    rectangle.normalize(this.model, this.model);
  }

  offset(dx: number, dy: number): void {
    rectangle.offset(this.model, this.model, dx, dy);
  }

  offsetPoint(point: Readonly<Vector2>): void {
    rectangle.offsetPoint(this.model, this.model, point.model);
  }

  setEmpty(): void {
    rectangle.setEmpty(this.model);
  }

  setTo(x: number, y: number, width: number, height: number): void {
    rectangle.setTo(this.model, x, y, width, height);
  }

  /**
   * Sets a Vector2 object to width and height
   */

  union(other: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.union(out.model, this.model, other.model);
    return out;
  }

  // Get & Set Methods

  get bottom(): number {
    return rectangle.bottom(this.model);
  }

  set bottom(value: number) {
    rectangle.setBottom(this.model, value);
  }

  get bottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.bottomRight(out.model, this.model);
    return out;
  }

  set bottomRight(value: Readonly<Vector2>) {
    rectangle.setBottomRight(this.model, value.model);
  }

  get height(): number {
    return this.model.height;
  }

  set height(value: number) {
    this.model.height = value;
  }

  get isFlippedX(): boolean {
    return rectangle.isFlippedX(this.model);
  }

  get isFlippedY(): boolean {
    return rectangle.isFlippedY(this.model);
  }

  get left(): number {
    return rectangle.left(this.model);
  }

  set left(value: number) {
    rectangle.setLeft(this.model, value);
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return rectangle.minY(this.model);
  }

  get maxX(): number {
    return rectangle.maxX(this.model);
  }

  get maxY(): number {
    return rectangle.maxY(this.model);
  }

  get normalizedBottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedBottomRight(out.model, this.model);
    return out;
  }

  get normalizedTopLeft(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedTopLeft(out.model, this.model);
    return out;
  }

  get right(): number {
    return rectangle.right(this.model);
  }

  set right(value: number) {
    rectangle.setRight(this.model, value);
  }

  get size(): Vector2 {
    const out = new Vector2();
    rectangle.size(out.model, this.model);
    return out;
  }

  set size(value: Readonly<Vector2>) {
    rectangle.setSize(this.model, value);
  }

  get top(): number {
    return rectangle.top(this.model);
  }

  set top(value: number) {
    rectangle.setTop(this.model, value);
  }

  get topLeft(): Vector2 {
    const out = new Vector2();
    rectangle.topLeft(out.model, this.model);
    return out;
  }

  set topLeft(value: Readonly<Vector2>) {
    rectangle.setTopLeft(this.model, value);
  }

  get width(): number {
    return this.model.width;
  }

  set width(value: number) {
    this.model.width = value;
  }

  get x(): number {
    return this.model.x;
  }

  set x(value: number) {
    this.model.x = value;
  }

  get y(): number {
    return this.model.y;
  }

  set y(value: number) {
    this.model.y = value;
  }
}
