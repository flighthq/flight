import { createEntity } from '@flighthq/core';
import type { Vector2Like, Vector3, Vector3Like } from '@flighthq/types';

export const X_AXIS: Readonly<Vector3> = create(1, 0, 0);
export const Y_AXIS: Readonly<Vector3> = create(0, 1, 0);
export const Z_AXIS: Readonly<Vector3> = create(0, 0, 1);

/**
 * The Vector3Like class represents a point or a location in the three-dimensional space using
 * the Cartesian coordinates x, y, and z. As in a two-dimensional space, the `x` property
 * represents the horizontal axis and the `y` property represents the vertical axis. In
 * three-dimensional space, the `z` property represents depth. The value of the `x` property increases as the object moves to the right. The value of the `y` property
 * increases as the object moves down. The `z` property increases as the object moves
 * farther from the point of view. Using perspective projection and scaling, the object is
 * seen to be bigger when near and smaller when farther away from the screen. As in a
 * right-handed three-dimensional coordinate system, the positive z-axis points away from
 * the viewer and the value of the `z` property increases as the object moves away from the
 * viewer's eye. The origin point (0,0,0) of the global space is the upper-left corner of
 * the stage.
 *
 * Invariants:
 *
 * - `X_AXIS = new Vector3Like(1, 0, 0);`
 * - `Y_AXIS = new Vector3Like(0, 1, 0);`
 * - `Z_AXIS = new Vector3Like(0, 0, 1);`
 * - `length = Math.sqrt(x ** 2 + y ** 2 + z ** 2);`
 * - `lengthSquared = x ** 2 + y ** 2 + z ** 2;`
 */
export function create(x?: number, y?: number, z?: number): Vector3 {
  return createEntity({ x: x ?? 0, y: y ?? 0, z: z ?? 0 });
}

/**
 * Adds the x, y and z components of two vector objects
 * and writes to out.
 */
export function add(out: Vector3Like, a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector3Like object rotates until it aligns with the
 * second Vector3Like object.
 **/
export function angleBetween(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  const la = length(a);
  const lb = length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

export function clone(source: Readonly<Vector3Like>): Vector3 {
  return create(source.x, source.y, source.z);
}

/**
 * Copies the x, y and z components of a vector.
 */
export function copy(out: Vector3Like, source: Readonly<Vector3Like>): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
}

/**
 * Writes a Vector3Like object that is perpendicular (at a right angle) to the
 * current Vector3Like and another Vector3Like object. If the returned Vector3Like object's
 * coordinates are (0,0,0), then the two Vector3Like objects are parallel to each other.
 **/
export function cross(out: Vector3Like, source: Readonly<Vector3Like>, other: Readonly<Vector3Like>): void {
  const x = source.y * other.z - source.z * other.y;
  const y = source.z * other.x - source.x * other.z;
  const z = source.x * other.y - source.y * other.x;
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Returns the distance between two Vector3Like objects.
 **/
export function distance(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;

  return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
}

/**
 * Returns the distance (squared) between two Vector3Like objects.
 *
 * This avoids Math.sqrt for better performance.
 **/
export function distanceSquared(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;

  return x ** 2 + y ** 2 + z ** 2;
}

/**
 * If the current Vector3Like object and the one specified as the parameter are unit
 * vertices, this method returns the cosine of the angle between the two vertices.
 * Unit vertices are vertices that point to the same direction but their length is
 * one. They remove the length of the vector as a factor in the result. You can use
 * the `normalize()` method to convert a vector to a unit vector.
 **/
export function dot(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function equals(
  a: Readonly<Vector3Like> | null | undefined,
  b: Readonly<Vector3Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * The length, magnitude, of the current Vector3Like object from the origin (0,0,0) to
 * the object's x, y, and z coordinates. The `w` property is ignored. A unit vector has
 * a length or magnitude of one.
 **/
export function length(source: Readonly<Vector3Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2);
}

/**
 * The square of the length of the current Vector3Like object, calculated using the `x`,
 * `y`, and `z` properties. The `w` property is ignored. Use the `lengthSquared()`
 * method whenever possible instead of the slower `Math.sqrt()` method call of the
 * `Vector3Like.length()` method.
 **/
export function lengthSquared(source: Readonly<Vector3Like>): number {
  return source.x ** 2 + source.y ** 2 + source.z ** 2;
}

/**
 * Compares the elements of the current Vector3Like object with the elements of a
 * specified Vector3Like object to determine whether they are nearly equal.
 *
 * The two Vector3Like objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function nearEquals(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>, tolerance: number = 1e-6): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance && Math.abs(a.z - b.z) < tolerance;
}

/**
 * Sets the current Vector3Like object to its inverse. The inverse object is also
 * considered the opposite of the original object. The value of the `x`, `y`, and `z`
 * properties of the current Vector3Like object is changed to -x, -y, and -z.
 **/
export function negate(out: Vector3Like, source: Readonly<Vector3Like>): void {
  out.x = source.x * -1;
  out.y = source.y * -1;
  out.z = source.z * -1;
}

/**
 * Converts a Vector3Like object to a unit vector by dividing the first three elements
 * (x, y, z) by the length of the vector.
 *
 * Returns the original length.
 **/
export function normalize(out: Vector3Like, source: Readonly<Vector3Like>): number {
  const l = length(source);

  if (l !== 0) {
    out.x = source.x / l;
    out.y = source.y / l;
    out.z = source.z / l;
  }

  return l;
}

/**
 * Divides the value of the `x` and `y` properties of the current Vector3Like
 * object by the value of its `z` property.
 **/
export function project(out: Vector2Like, source: Readonly<Vector3Like>): void {
  out.x = source.x / source.z;
  out.y = source.y / source.z;
}

/**
 * Scales the current Vector3Like object by a scalar, a magnitude. The Vector3Like object's
 * x, y, and z elements are multiplied by the provided scalar number.
 **/
export function scale(out: Vector3Like, source: Readonly<Vector3Like>, scalar: number): void {
  out.x = source.x * scalar;
  out.y = source.y * scalar;
  out.z = source.z * scalar;
}

/**
 * Sets the members of Vector3Like to the specified values
 **/
export function setTo(out: Vector3Like, x: number, y: number, z: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Subtracts the value of the x, y, and z elements of the current Vector3Like object
 * from the values of the x, y, and z elements of another Vector3Like object.
 **/
export function subtract(out: Vector3Like, source: Readonly<Vector3Like>, other: Readonly<Vector3Like>): void {
  out.x = source.x - other.x;
  out.y = source.y - other.y;
  out.z = source.z - other.z;
}
