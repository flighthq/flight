import type { Vector2 } from '@flighthq/types';

/**
 * The Vector2 object represents a location in a two-dimensional coordinate
 * system, where _x_ represents the horizontal axis and _y_
 * represents the vertical axis.
 *
 * Invariants:
 *
 * - `length = Math.sqrt(x ** 2 + y ** 2)`
 * - `lengthSquared = x ** 2 + y ** 2`
 *
 * @see Rectangle
 * @see Affine2D
 */
export function create(x?: number, y?: number): Vector2 {
  return { x: x ?? 0, y: y ?? 0 };
}

export function add(out: Vector2, a: Readonly<Vector2>, b: Readonly<Vector2>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
}

export function clone(source: Readonly<Vector2>): Vector2 {
  return create(source.x, source.y);
}

export function copy(out: Vector2, source: Readonly<Vector2>): void {
  out.x = source.x;
  out.y = source.y;
}

export function createPolar(len: number, angle: number): Vector2 {
  const out = create();
  setPolar(out, len, angle);
  return out;
}

export function distance(a: Readonly<Vector2>, b: Readonly<Vector2>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function equals(a: Readonly<Vector2> | null | undefined, b: Readonly<Vector2> | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b || (a.x === b.x && a.y === b.y);
}

export function length(source: Readonly<Vector2>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2);
}

export function lengthSquared(source: Readonly<Vector2>): number {
  return source.x ** 2 + source.y ** 2;
}

/**
 * Linear interpolation between points a and b
 */
export function lerp(out: Vector2, a: Readonly<Vector2>, b: Readonly<Vector2>, t: number): void {
  out.x = a.x + t * (b.x - a.x);
  out.y = a.y + t * (b.y - a.y);
}

/**
 * Writes a point representing this vector scaled to a given length.
 *
 * The direction of the vector is preserved. If the original vector has zero length,
 * the returned point will also be (0, 0).
 */
export function normalize(out: Vector2, source: Readonly<Vector2>, newLength: number): void {
  const currentLength = length(source);
  if (currentLength === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    const scale = newLength / currentLength;
    out.x = source.x * scale;
    out.y = source.y * scale;
  }
}

export function offset(out: Vector2, source: Readonly<Vector2>, dx: number, dy: number): void {
  out.x = source.x + dx;
  out.y = source.y + dy;
}

export function set(out: Vector2, x: number, y: number): void {
  out.x = x;
  out.y = y;
}

export function setPolar(out: Vector2, len: number, angle: number): void {
  out.x = len * Math.cos(angle);
  out.y = len * Math.sin(angle);
}

export function subtract(out: Vector2, source: Readonly<Vector2>, toSubtract: Readonly<Vector2>): void {
  out.x = source.x - toSubtract.x;
  out.y = source.y - toSubtract.y;
}
