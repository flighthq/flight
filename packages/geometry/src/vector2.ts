import { createEntity } from '@flighthq/entity';
import type { Vector2, Vector2Like } from '@flighthq/types';

export function addVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
}

export function cloneVector2(source: Readonly<Vector2Like>): Vector2 {
  return createVector2(source.x, source.y);
}

export function copyVector2(out: Vector2Like, source: Readonly<Vector2Like>): void {
  out.x = source.x;
  out.y = source.y;
}

/**
 * The Vector2Like object represents a location in a two-dimensional coordinate
 * system, where _x_ represents the horizontal axis and _y_
 * represents the vertical axis.
 *
 * Invariants:
 *
 * - `length = Math.sqrt(x ** 2 + y ** 2)`
 * - `lengthSquared = x ** 2 + y ** 2`
 *
 * @see Rectangle
 * @see Matrix
 */
export function createVector2(x?: number, y?: number): Vector2 {
  return createEntity({ x: x ?? 0, y: y ?? 0 });
}

export function createVector2FromPolar(length: number, angle: number): Vector2 {
  const out = createVector2();
  setVector2FromPolar(out, length, angle);
  return out;
}

export function equalsVector2(
  a: Readonly<Vector2Like> | null | undefined,
  b: Readonly<Vector2Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a === b || (a.x === b.x && a.y === b.y);
}

export function getVector2Distance(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getVector2Length(source: Readonly<Vector2Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2);
}

export function getVector2LengthSquared(source: Readonly<Vector2Like>): number {
  return source.x ** 2 + source.y ** 2;
}

/**
 * Linear interpolation between points a and b
 */
export function interpolateVector2(
  out: Vector2Like,
  a: Readonly<Vector2Like>,
  b: Readonly<Vector2Like>,
  t: number,
): void {
  out.x = a.x + t * (b.x - a.x);
  out.y = a.y + t * (b.y - a.y);
}

/**
 * Writes a point representing this vector scaled to a given length.
 *
 * The direction of the vector is preserved. If the original vector has zero length,
 * the returned point will also be (0, 0).
 */
export function normalizeVector2(out: Vector2Like, source: Readonly<Vector2Like>, newLength: number): void {
  const currentLength = getVector2Length(source);
  if (currentLength === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    const scale = newLength / currentLength;
    out.x = source.x * scale;
    out.y = source.y * scale;
  }
}

export function offsetVector2(out: Vector2Like, source: Readonly<Vector2Like>, dx: number, dy: number): void {
  out.x = source.x + dx;
  out.y = source.y + dy;
}

export function setVector2(out: Vector2Like, x: number, y: number): void {
  out.x = x;
  out.y = y;
}

export function setVector2FromFloat32Array(out: Vector2Like, offset: number, source: Readonly<Float32Array>): void {
  out.x = source[offset];
  out.y = source[offset + 1];
}

export function setVector2FromPolar(out: Vector2Like, length: number, angle: number): void {
  out.x = length * Math.cos(angle);
  out.y = length * Math.sin(angle);
}

export function subtractVector2(out: Vector2Like, source: Readonly<Vector2Like>, other: Readonly<Vector2Like>): void {
  out.x = source.x - other.x;
  out.y = source.y - other.y;
}

export function writeVector2ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Vector2Like>): void {
  out[offset] = source.x;
  out[offset + 1] = source.y;
}

export const VECTOR2_X_AXIS: Readonly<Vector2> = createVector2(1, 0);
export const VECTOR2_Y_AXIS: Readonly<Vector2> = createVector2(0, 1);
