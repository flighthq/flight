import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Vector2, Vector2Like, Vector3Like } from '@flighthq/types/contract';

export function addVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {
  const ax = a.x,
    ay = a.y;
  const bx = b.x,
    by = b.y;
  out.x = ax + bx;
  out.y = ay + by;
}

/**
 * Clamps each component of a Vector2Like independently to [min, max].
 *
 * Safe when `out` aliases `value`, `min`, or `max`.
 */
export function clampVector2(
  out: Vector2Like,
  value: Readonly<Vector2Like>,
  min: Readonly<Vector2Like>,
  max: Readonly<Vector2Like>,
): void {
  const vx = value.x,
    vy = value.y;
  const minX = min.x,
    minY = min.y;
  const maxX = max.x,
    maxY = max.y;
  out.x = vx < minX ? minX : vx > maxX ? maxX : vx;
  out.y = vy < minY ? minY : vy > maxY ? maxY : vy;
}

export function cloneVector2(source: Readonly<Vector2Like>): Vector2 {
  return createVector2(source.x, source.y);
}

export function copyVector2(out: Vector2Like, source: Readonly<Vector2Like>): void {
  const x = source.x,
    y = source.y;
  out.x = x;
  out.y = y;
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
  const out = allocateEntity<Vector2>();
  initializeVector2(out, x ?? 0, y ?? 0);
  return finishEntity(out);
}

export function createVector2FromPolar(length: number, angle: number): Vector2 {
  const out = createVector2();
  setVector2FromPolar(out, length, angle);
  return out;
}

/**
 * Returns the 2D cross product (wedge product): the z-component of the 3D cross product if both
 * vectors were extended to z = 0. Positive when `b` is counter-clockwise from `a`.
 */
export function crossVector2(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Component-wise division of two vectors (Hadamard division). Each component of
 * `source` is divided by the corresponding component of `divisor`. Components with a
 * zero divisor produce `0` in the output.
 *
 * Safe when `out` aliases `source` or `divisor`.
 */
export function divideVector2(out: Vector2Like, source: Readonly<Vector2Like>, divisor: Readonly<Vector2Like>): void {
  const sx = source.x,
    sy = source.y;
  const dx = divisor.x,
    dy = divisor.y;
  out.x = dx !== 0 ? sx / dx : 0;
  out.y = dy !== 0 ? sy / dy : 0;
}

export function equalsVector2(
  a: Readonly<Vector2Like> | null | undefined,
  b: Readonly<Vector2Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a === b || (a.x === b.x && a.y === b.y);
}

/**
 * Returns the signed angle in radians from the positive x-axis to the vector, in the range
 * (−π, π]. Returns 0 for the zero vector.
 */
export function getVector2Angle(source: Readonly<Vector2Like>): number {
  if (source.x === 0 && source.y === 0) return 0;
  return Math.atan2(source.y, source.x);
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector2Like object rotates until it aligns with the
 * second Vector2Like object.
 **/
export function getVector2AngleBetween(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  const la = getVector2Length(a);
  const lb = getVector2Length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = getVector2Dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

export function getVector2Distance(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns the distance (squared) between two Vector2Like objects.
 *
 * This avoids Math.sqrt for better performance.
 **/
export function getVector2DistanceSquared(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx ** 2 + dy ** 2;
}

/**
 * If the current Vector2Like object and the one specified as the parameter are unit
 * vertices, this method returns the cosine of the angle between the two vertices.
 * Unit vertices are vertices that point to the same direction but their length is
 * one. They remove the length of the vector as a factor in the result. You can use
 * the `normalize()` method to convert a vector to a unit vector.
 **/
export function getVector2Dot(a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): number {
  return a.x * b.x + a.y * b.y;
}

export function getVector2Length(source: Readonly<Vector2Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2);
}

export function getVector2LengthSquared(source: Readonly<Vector2Like>): number {
  return source.x ** 2 + source.y ** 2;
}

export function initializeVector2(out: EntityConstruction<Vector2>, x: number, y: number): void {
  out.x = x;
  out.y = y;
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
  const ax = a.x,
    ay = a.y;
  const bx = b.x,
    by = b.y;
  out.x = ax + t * (bx - ax);
  out.y = ay + t * (by - ay);
}

/**
 * Writes the per-component maximum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function maxVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {
  const ax = a.x,
    ay = a.y;
  const bx = b.x,
    by = b.y;
  out.x = ax > bx ? ax : bx;
  out.y = ay > by ? ay : by;
}

/**
 * Writes the per-component minimum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function minVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {
  const ax = a.x,
    ay = a.y;
  const bx = b.x,
    by = b.y;
  out.x = ax < bx ? ax : bx;
  out.y = ay < by ? ay : by;
}

/**
 * Component-wise product of two vectors (Hadamard product).
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function multiplyVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {
  const ax = a.x,
    ay = a.y;
  const bx = b.x,
    by = b.y;
  out.x = ax * bx;
  out.y = ay * by;
}

/**
 * Compares the elements of the current Vector2Like object with the elements of a
 * specified Vector2Like object to determine whether they are nearly equal.
 *
 * The two Vector2Like objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function nearEqualsVector2(
  a: Readonly<Vector2Like>,
  b: Readonly<Vector2Like>,
  tolerance: number = 1e-6,
): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
}

/**
 * Sets the current Vector2Like object to its inverse. The inverse object is also
 * considered the opposite of the original object. The value of the `x` and `y`
 * properties of the current Vector2Like object is changed to -x and -y.
 **/
export function negateVector2(out: Vector2Like, source: Readonly<Vector2Like>): void {
  const x = source.x,
    y = source.y;
  out.x = x * -1;
  out.y = y * -1;
}

/**
 * Converts a Vector2Like object to a unit vector by dividing both elements
 * (x, y) by the length of the vector.
 *
 * Returns the original length.
 **/
export function normalizeVector2(out: Vector2Like, source: Readonly<Vector2Like>): number {
  const x = source.x,
    y = source.y;
  const l = Math.sqrt(x ** 2 + y ** 2);

  if (l !== 0) {
    out.x = x / l;
    out.y = y / l;
  } else {
    out.x = 0;
    out.y = 0;
  }

  return l;
}

export function offsetVector2(out: Vector2Like, source: Readonly<Vector2Like>, dx: number, dy: number): void {
  const x = source.x,
    y = source.y;
  out.x = x + dx;
  out.y = y + dy;
}

/**
 * Reflects an incident vector about a unit normal. The result is the reflection of
 * `incident` across the line whose normal is `normal`.
 *
 * Formula: out = incident - 2 * dot(incident, normal) * normal
 *
 * Safe when `out` aliases `incident` or `normal`.
 */
export function reflectVector2(out: Vector2Like, incident: Readonly<Vector2Like>, normal: Readonly<Vector2Like>): void {
  const ix = incident.x,
    iy = incident.y;
  const nx = normal.x,
    ny = normal.y;
  const twoDot = 2 * (ix * nx + iy * ny);
  out.x = ix - twoDot * nx;
  out.y = iy - twoDot * ny;
}

/**
 * Rotates a 2D vector by `angle` radians (counter-clockwise). Safe when `out` aliases `source`.
 */
export function rotateVector2(out: Vector2Like, source: Readonly<Vector2Like>, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = source.x,
    y = source.y;
  out.x = x * c - y * s;
  out.y = x * s + y * c;
}

/**
 * Scales the current Vector2Like object by a scalar, a magnitude. The Vector2Like object's
 * x and y elements are multiplied by the provided scalar number.
 **/
export function scaleVector2(out: Vector2Like, source: Readonly<Vector2Like>, scalar: number): void {
  const x = source.x,
    y = source.y;
  out.x = x * scalar;
  out.y = y * scalar;
}

export function scaleVector2ToLength(out: Vector2Like, source: Readonly<Vector2Like>, length: number): void {
  const x = source.x,
    y = source.y;
  const currentLength = Math.sqrt(x ** 2 + y ** 2);
  if (currentLength === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    const scale = length / currentLength;
    out.x = x * scale;
    out.y = y * scale;
  }
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

/**
 * Copies the x and y components of a Vector3Like into a Vector2Like, dropping the z component.
 *
 * Safe when `out` aliases the same memory as `source`.
 */
export function setVector2FromVector3(out: Vector2Like, source: Readonly<Vector3Like>): void {
  out.x = source.x;
  out.y = source.y;
}

export function subtractVector2(out: Vector2Like, source: Readonly<Vector2Like>, other: Readonly<Vector2Like>): void {
  const sx = source.x,
    sy = source.y;
  const ox = other.x,
    oy = other.y;
  out.x = sx - ox;
  out.y = sy - oy;
}

export function writeVector2ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Vector2Like>): void {
  out[offset] = source.x;
  out[offset + 1] = source.y;
}

export const VECTOR2_X_AXIS: Readonly<Vector2> = createVector2(1, 0);
export const VECTOR2_Y_AXIS: Readonly<Vector2> = createVector2(0, 1);
