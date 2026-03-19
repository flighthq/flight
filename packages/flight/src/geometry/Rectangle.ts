import { rectangle } from '@flighthq/geometry';
import type { Rectangle as RectangleModel } from '@flighthq/types';

import Vector2 from './Vector2.js';

export default class Rectangle {
  protected _model: RectangleModel;

  constructor(x?: number, y?: number, width?: number, height?: number) {
    this._model = rectangle.create(x, y, width, height);
  }

  clone(): Rectangle {
    return Rectangle.fromModel(this._model);
  }

  contains(x: number, y: number): boolean {
    return rectangle.contains(this._model, x, y);
  }

  containsPoint(vector: Readonly<Vector2>): boolean {
    return rectangle.containsPoint(this._model, vector.model);
  }

  containsRect(other: Readonly<Rectangle>): boolean {
    return rectangle.containsRect(this._model, other.model);
  }

  copyFrom(source: Readonly<Rectangle>): void {
    rectangle.copy(this._model, source.model);
  }

  equals(b: Readonly<Rectangle> | null | undefined): boolean {
    if (!b) return false;
    return rectangle.equals(this._model, b.model);
  }

  static fromModel(model: Readonly<RectangleModel>): Rectangle {
    const out = new Rectangle();
    rectangle.copy(out.model, model);
    return out;
  }

  inflate(dx: number, dy: number): void {
    rectangle.inflate(this._model, this._model, dx, dy);
  }

  inflatePoint(sourceVec2: Readonly<Vector2>): void {
    rectangle.inflatePoint(this._model, this._model, sourceVec2.model);
  }

  intersection(b: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.intersection(out.model, this._model, b);
    return out;
  }

  intersects(b: Readonly<Rectangle>): boolean {
    return rectangle.intersects(this._model, b.model);
  }

  isEmpty(): boolean {
    return rectangle.isEmpty(this._model);
  }

  normalize(): void {
    rectangle.normalize(this._model, this._model);
  }

  offset(dx: number, dy: number): void {
    rectangle.offset(this._model, this._model, dx, dy);
  }

  offsetPoint(point: Readonly<Vector2>): void {
    rectangle.offsetPoint(this._model, this._model, point.model);
  }

  setEmpty(): void {
    rectangle.setEmpty(this._model);
  }

  setTo(x: number, y: number, width: number, height: number): void {
    rectangle.setTo(this._model, x, y, width, height);
  }

  /**
   * Sets a Vector2 object to width and height
   */

  union(other: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.union(out.model, this._model, other.model);
    return out;
  }

  // Get & Set Methods

  get bottom(): number {
    return rectangle.bottom(this._model);
  }

  set bottom(value: number) {
    rectangle.setBottom(this._model, value);
  }

  get bottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.bottomRight(out.model, this._model);
    return out;
  }

  set bottomRight(value: Readonly<Vector2>) {
    rectangle.setBottomRight(this._model, value.model);
  }

  get height(): number {
    return this._model.height;
  }

  set height(value: number) {
    this._model.height = value;
  }

  get isFlippedX(): boolean {
    return rectangle.isFlippedX(this._model);
  }

  get isFlippedY(): boolean {
    return rectangle.isFlippedY(this._model);
  }

  get left(): number {
    return rectangle.left(this._model);
  }

  set left(value: number) {
    rectangle.setLeft(this._model, value);
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return rectangle.minY(this._model);
  }

  get maxX(): number {
    return rectangle.maxX(this._model);
  }

  get maxY(): number {
    return rectangle.maxY(this._model);
  }

  get model(): RectangleModel {
    return this._model;
  }

  get normalizedBottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedBottomRight(out.model, this._model);
    return out;
  }

  get normalizedTopLeft(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedTopLeft(out.model, this._model);
    return out;
  }

  get right(): number {
    return rectangle.right(this._model);
  }

  set right(value: number) {
    rectangle.setRight(this._model, value);
  }

  get size(): Vector2 {
    const out = new Vector2();
    rectangle.size(out.model, this._model);
    return out;
  }

  set size(value: Readonly<Vector2>) {
    rectangle.setSize(this._model, value);
  }

  get top(): number {
    return rectangle.top(this._model);
  }

  set top(value: number) {
    rectangle.setTop(this._model, value);
  }

  get topLeft(): Vector2 {
    const out = new Vector2();
    rectangle.topLeft(out.model, this._model);
    return out;
  }

  set topLeft(value: Readonly<Vector2>) {
    rectangle.setTopLeft(this._model, value);
  }

  get width(): number {
    return this._model.width;
  }

  set width(value: number) {
    this._model.width = value;
  }

  get x(): number {
    return this._model.x;
  }

  set x(value: number) {
    this._model.x = value;
  }

  get y(): number {
    return this._model.y;
  }

  set y(value: number) {
    this._model.y = value;
  }
}
