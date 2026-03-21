import { rectangle } from '@flighthq/geometry';
import type { Rectangle as RawRectangle } from '@flighthq/types';

import FlightObject from '../FlightObject.js';
import Vector2 from './Vector2.js';

export default class Rectangle extends FlightObject<RawRectangle> {
  constructor(x?: number, y?: number, width?: number, height?: number) {
    super();
    const raw = this.__raw;
    if (x !== undefined) raw.x = x;
    if (y !== undefined) raw.y = y;
    if (width !== undefined) raw.width = width;
    if (height !== undefined) raw.height = height;
  }

  protected override __create() {
    return rectangle.create();
  }

  clone(): Rectangle {
    return Rectangle.fromRaw(this.__raw);
  }

  contains(x: number, y: number): boolean {
    return rectangle.contains(this.__raw, x, y);
  }

  containsPoint(vector: Readonly<Vector2>): boolean {
    return rectangle.containsPoint(this.__raw, vector.raw);
  }

  containsRect(other: Readonly<Rectangle>): boolean {
    return rectangle.containsRect(this.__raw, other.raw);
  }

  copyFrom(source: Readonly<Rectangle>): void {
    rectangle.copy(this.__raw, source.raw);
  }

  equals(b: Readonly<Rectangle> | null | undefined): boolean {
    if (!b) return false;
    return rectangle.equals(this.__raw, b.raw);
  }

  static fromRaw(raw: Readonly<RawRectangle>): Rectangle {
    return FlightObject.getOrCreate(raw, Rectangle)!;
  }

  inflate(dx: number, dy: number): void {
    rectangle.inflate(this.__raw, this.__raw, dx, dy);
  }

  inflatePoint(sourceVec2: Readonly<Vector2>): void {
    rectangle.inflatePoint(this.__raw, this.__raw, sourceVec2.raw);
  }

  intersection(b: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.intersection(out.raw, this.__raw, b);
    return out;
  }

  intersects(b: Readonly<Rectangle>): boolean {
    return rectangle.intersects(this.__raw, b.raw);
  }

  isEmpty(): boolean {
    return rectangle.isEmpty(this.__raw);
  }

  normalize(): void {
    rectangle.normalize(this.__raw, this.__raw);
  }

  offset(dx: number, dy: number): void {
    rectangle.offset(this.__raw, this.__raw, dx, dy);
  }

  offsetPoint(point: Readonly<Vector2>): void {
    rectangle.offsetPoint(this.__raw, this.__raw, point.raw);
  }

  setEmpty(): void {
    rectangle.setEmpty(this.__raw);
  }

  setTo(x: number, y: number, width: number, height: number): void {
    rectangle.setTo(this.__raw, x, y, width, height);
  }

  /**
   * Sets a Vector2 object to width and height
   */

  union(other: Readonly<Rectangle>): Rectangle {
    const out = new Rectangle();
    rectangle.union(out.raw, this.__raw, other.raw);
    return out;
  }

  // Get & Set Methods

  get bottom(): number {
    return rectangle.bottom(this.__raw);
  }

  set bottom(value: number) {
    rectangle.setBottom(this.__raw, value);
  }

  get bottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.bottomRight(out.raw, this.__raw);
    return out;
  }

  set bottomRight(value: Readonly<Vector2>) {
    rectangle.setBottomRight(this.__raw, value.raw);
  }

  get height(): number {
    return this.__raw.height;
  }

  set height(value: number) {
    this.__raw.height = value;
  }

  get isFlippedX(): boolean {
    return rectangle.isFlippedX(this.__raw);
  }

  get isFlippedY(): boolean {
    return rectangle.isFlippedY(this.__raw);
  }

  get left(): number {
    return rectangle.left(this.__raw);
  }

  set left(value: number) {
    rectangle.setLeft(this.__raw, value);
  }

  get minX(): number {
    return Math.min(this.x, this.right);
  }

  get minY(): number {
    return rectangle.minY(this.__raw);
  }

  get maxX(): number {
    return rectangle.maxX(this.__raw);
  }

  get maxY(): number {
    return rectangle.maxY(this.__raw);
  }

  get normalizedBottomRight(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedBottomRight(out.raw, this.__raw);
    return out;
  }

  get normalizedTopLeft(): Vector2 {
    const out = new Vector2();
    rectangle.normalizedTopLeft(out.raw, this.__raw);
    return out;
  }

  get right(): number {
    return rectangle.right(this.__raw);
  }

  set right(value: number) {
    rectangle.setRight(this.__raw, value);
  }

  get size(): Vector2 {
    const out = new Vector2();
    rectangle.size(out.raw, this.__raw);
    return out;
  }

  set size(value: Readonly<Vector2>) {
    rectangle.setSize(this.__raw, value);
  }

  get top(): number {
    return rectangle.top(this.__raw);
  }

  set top(value: number) {
    rectangle.setTop(this.__raw, value);
  }

  get topLeft(): Vector2 {
    const out = new Vector2();
    rectangle.topLeft(out.raw, this.__raw);
    return out;
  }

  set topLeft(value: Readonly<Vector2>) {
    rectangle.setTopLeft(this.__raw, value);
  }

  get width(): number {
    return this.__raw.width;
  }

  set width(value: number) {
    this.__raw.width = value;
  }

  get x(): number {
    return this.__raw.x;
  }

  set x(value: number) {
    this.__raw.x = value;
  }

  get y(): number {
    return this.__raw.y;
  }

  set y(value: number) {
    this.__raw.y = value;
  }
}
