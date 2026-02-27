import type { Vector3, Vector4 } from '@flighthq/types';

export const X_AXIS: Readonly<Vector4> = create(1, 0, 0, 0);
export const Y_AXIS: Readonly<Vector4> = create(0, 1, 0, 0);
export const Z_AXIS: Readonly<Vector4> = create(0, 0, 1, 0);
export const W_AXIS: Readonly<Vector4> = create(0, 0, 0, 1);

/**
 * The Vector4 class represents a vector or point in four-dimensional space using the
 * Cartesian coordinates x, y, z, and w.
 *
 * In this space, each component represents an independent axis. When Vector4 is used
 * for three-dimensional graphics or homogeneous coordinates, the x, y, and z components
 * typically represent spatial position, while the w component may be used for perspective
 * projection or other higher-dimensional calculations.
 *
 * Invariants:
 *
 * - `X_AXIS = new Vector4(1, 0, 0, 0);`
 * - `Y_AXIS = new Vector4(0, 1, 0, 0);`
 * - `Z_AXIS = new Vector4(0, 0, 1, 0);`
 * - `W_AXIS = new Vector4(0, 0, 0, 1);`
 * - `length = Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);`
 * - `lengthSquared = x ** 2 + y ** 2 + z ** 2 + w ** 2;`
 */
export function create(x?: number, y?: number, z?: number, w?: number): Vector4 {
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0, w: w ?? 0 };
}

/**
 * Adds the x, y, z and w components of two vector objects
 * and writes to out.
 */
export function add(out: Vector4, a: Readonly<Vector4>, b: Readonly<Vector4>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  out.w = a.w + b.w;
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector4 object rotates until it aligns with the
 * second Vector4 object.
 **/
export function angleBetween(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
  const la = length(a);
  const lb = length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

export function clone(source: Readonly<Vector4>): Vector4 {
  return create(source.x, source.y, source.z, source.w);
}

/**
 * Copies the x, y, z and w components of another vector.
 */
export function copy(out: Vector4, source: Readonly<Vector4>): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
  out.w = source.w;
}

/**
 * Returns the distance between two Vector4 objects.
 **/
export function distance(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;
  const w: number = b.w - a.w;

  return Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);
}

/**
 * Returns the distance (squared) between two Vector4 objects.
 *
 * This avoids Math.sqrt for better performance.
 **/
export function distanceSquared(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;
  const w: number = b.w - a.w;

  return x ** 2 + y ** 2 + z ** 2 + w ** 2;
}

/**
 * If the current Vector4 object and the one specified as the parameter are unit
 * vertices, this method returns the cosine of the angle between the two vertices.
 * Unit vertices are vertices that point to the same direction but their length is
 * one. They remove the length of the vector as a factor in the result. You can use
 * the `normalize()` method to convert a vector to a unit vector.
 **/
export function dot(a: Readonly<Vector4>, b: Readonly<Vector4>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function equals(a: Readonly<Vector4> | null | undefined, b: Readonly<Vector4> | null | undefined): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
}

/**
 * The length, magnitude, of the current Vector4 object from the origin (0,0,0) to
 * the object's x, y, z and w coordinates. A unit vector has
 * a length or magnitude of one.
 **/
export function length(source: Readonly<Vector4>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2);
}

/**
 * The square of the length of the current Vector4 object, calculated using the `x`,
 * `y`, `z`, and 'w' properties. Use the `lengthSquared()`
 * method whenever possible instead of the slower `Math.sqrt()` method call of the
 * `Vector4.length()` method.
 **/
export function lengthSquared(source: Readonly<Vector4>): number {
  return source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2;
}

/**
 * Compares the elements of the current Vector4 object with the elements of a
 * specified Vector4 object to determine whether they are nearly equal.
 *
 * The two Vector4 objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function nearEquals(a: Readonly<Vector4>, b: Readonly<Vector4>, tolerance: number = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.z - b.z) < tolerance &&
    Math.abs(a.w - b.w) < tolerance
  );
}

/**
 * Sets the current Vector4 object to its inverse. The inverse object is also
 * considered the opposite of the original object. The value of the `x`, `y`, and `z`
 * properties of the current Vector4 object is changed to -x, -y, and -z.
 **/
export function negate(out: Vector4, source: Readonly<Vector4>): void {
  out.x = source.x * -1;
  out.y = source.y * -1;
  out.z = source.z * -1;
  out.w = source.w * -1;
}

/**
 * Converts a Vector4 object to a unit vector by dividing all elements
 * (x, y, z and w) by the length of the vector.
 *
 * Returns the original length.
 **/
export function normalize(out: Vector4, source: Readonly<Vector4>): number {
  const l = length(source);

  if (l !== 0) {
    out.x = source.x / l;
    out.y = source.y / l;
    out.z = source.z / l;
    out.w = source.w / l;
  }

  return l;
}

/**
 * Divides the value of the `x`, `y`, and `z` properties of the current Vector4
 * object by the value of its `w` property.
 **/
export function project(out: Vector3, source: Readonly<Vector4>): void {
  out.x = source.x / source.w;
  out.y = source.y / source.w;
  out.z = source.z / source.w;
}

/**
 * Scales the current Vector4 object by a scalar, a magnitude. The Vector4 object's
 * x, y, z and w elements are multiplied by the provided scalar number.
 **/
export function scale(out: Vector4, source: Readonly<Vector4>, scalar: number): void {
  out.x = source.x * scalar;
  out.y = source.y * scalar;
  out.z = source.z * scalar;
  out.w = source.w * scalar;
}

/**
 * Sets the members of Vector4 to the specified values
 **/
export function setTo(out: Vector4, x: number, y: number, z: number, w: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

/**
 * Subtracts the value of the x, y, z and w elements of the current Vector4 object
 * from the values of the x, y, z and w elements of another Vector4 object.
 **/
export function subtract(out: Vector4, source: Readonly<Vector4>, other: Readonly<Vector4>): void {
  out.x = source.x - other.x;
  out.y = source.y - other.y;
  out.z = source.z - other.z;
  out.w = source.w - other.w;
}
