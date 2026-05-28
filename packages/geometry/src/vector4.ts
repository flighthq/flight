import { createEntity } from '@flighthq/entity';
import type { Vector3Like, Vector4, Vector4Like } from '@flighthq/types';

export const VEC4_X_AXIS: Readonly<Vector4> = createVector4(1, 0, 0, 0);
export const VEC4_Y_AXIS: Readonly<Vector4> = createVector4(0, 1, 0, 0);
export const VEC4_Z_AXIS: Readonly<Vector4> = createVector4(0, 0, 1, 0);
export const VEC4_W_UNIT: Readonly<Vector4> = createVector4(0, 0, 0, 1);

/**
 * The Vector4Like class represents a vector or point in four-dimensional space using the
 * Cartesian coordinates x, y, z, and w.
 *
 * In this space, each component represents an independent axis. When Vector4Like is used
 * for three-dimensional graphics or homogeneous coordinates, the x, y, and z components
 * typically represent spatial position, while the w component may be used for perspective
 * projection or other higher-dimensional calculations.
 *
 * Invariants:
 *
 * - `X_AXIS = new Vector4Like(1, 0, 0, 0);`
 * - `Y_AXIS = new Vector4Like(0, 1, 0, 0);`
 * - `Z_AXIS = new Vector4Like(0, 0, 1, 0);`
 * - `W_UNIT = new Vector4Like(0, 0, 0, 1);`
 * - `length = Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);`
 * - `lengthSquared = x ** 2 + y ** 2 + z ** 2 + w ** 2;`
 */
export function createVector4(x?: number, y?: number, z?: number, w?: number): Vector4 {
  return createEntity({ x: x ?? 0, y: y ?? 0, z: z ?? 0, w: w ?? 0 });
}

/**
 * Adds the x, y, z and w components of two vector objects
 * and writes to out.
 */
export function vec4Add(out: Vector4Like, a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  out.w = a.w + b.w;
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector4Like object rotates until it aligns with the
 * second Vector4Like object.
 **/
export function vec4AngleBetween(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  const la = vec4Length(a);
  const lb = vec4Length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = vec4Dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

export function vec4Clone(source: Readonly<Vector4Like>): Vector4 {
  return createVector4(source.x, source.y, source.z, source.w);
}

/**
 * Copies the x, y, z and w components of another vector.
 */
export function vec4Copy(out: Vector4Like, source: Readonly<Vector4Like>): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
  out.w = source.w;
}

/**
 * Returns the distance between two Vector4Like objects.
 **/
export function vec4Distance(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;
  const w: number = b.w - a.w;

  return Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);
}

/**
 * Returns the distance (squared) between two Vector4Like objects.
 *
 * This avoids Math.sqrt for better performance.
 **/
export function vec4DistanceSquared(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  const x: number = b.x - a.x;
  const y: number = b.y - a.y;
  const z: number = b.z - a.z;
  const w: number = b.w - a.w;

  return x ** 2 + y ** 2 + z ** 2 + w ** 2;
}

/**
 * If the current Vector4Like object and the one specified as the parameter are unit
 * vertices, this method returns the cosine of the angle between the two vertices.
 * Unit vertices are vertices that point to the same direction but their length is
 * one. They remove the length of the vector as a factor in the result. You can use
 * the `normalize()` method to convert a vector to a unit vector.
 **/
export function vec4Dot(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function vec4Equals(
  a: Readonly<Vector4Like> | null | undefined,
  b: Readonly<Vector4Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
}

/**
 * The length, magnitude, of the current Vector4Like object from the origin (0,0,0) to
 * the object's x, y, z and w coordinates. A unit vector has
 * a length or magnitude of one.
 **/
export function vec4Length(source: Readonly<Vector4Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2);
}

/**
 * The square of the length of the current Vector4Like object, calculated using the `x`,
 * `y`, `z`, and 'w' properties. Use the `lengthSquared()`
 * method whenever possible instead of the slower `Math.sqrt()` method call of the
 * `Vector4Like.length()` method.
 **/
export function vec4LengthSquared(source: Readonly<Vector4Like>): number {
  return source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2;
}

/**
 * Compares the elements of the current Vector4Like object with the elements of a
 * specified Vector4Like object to determine whether they are nearly equal.
 *
 * The two Vector4Like objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function vec4NearEquals(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>, tolerance: number = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.z - b.z) < tolerance &&
    Math.abs(a.w - b.w) < tolerance
  );
}

/**
 * Sets the current Vector4Like object to its inverse. The inverse object is also
 * considered the opposite of the original object. The value of the `x`, `y`, and `z`
 * properties of the current Vector4Like object is changed to -x, -y, and -z.
 **/
export function vec4Negate(out: Vector4Like, source: Readonly<Vector4Like>): void {
  out.x = source.x * -1;
  out.y = source.y * -1;
  out.z = source.z * -1;
  out.w = source.w * -1;
}

/**
 * Converts a Vector4Like object to a unit vector by dividing all elements
 * (x, y, z and w) by the length of the vector.
 *
 * Returns the original length.
 **/
export function vec4Normalize(out: Vector4Like, source: Readonly<Vector4Like>): number {
  const l = vec4Length(source);

  if (l !== 0) {
    out.x = source.x / l;
    out.y = source.y / l;
    out.z = source.z / l;
    out.w = source.w / l;
  }

  return l;
}

/**
 * Divides the value of the `x`, `y`, and `z` properties of the current Vector4Like
 * object by the value of its `w` property.
 **/
export function vec4Project(out: Vector3Like, source: Readonly<Vector4Like>): void {
  out.x = source.x / source.w;
  out.y = source.y / source.w;
  out.z = source.z / source.w;
}

/**
 * Scales the current Vector4Like object by a scalar, a magnitude. The Vector4Like object's
 * x, y, z and w elements are multiplied by the provided scalar number.
 **/
export function vec4Scale(out: Vector4Like, source: Readonly<Vector4Like>, scalar: number): void {
  out.x = source.x * scalar;
  out.y = source.y * scalar;
  out.z = source.z * scalar;
  out.w = source.w * scalar;
}

/**
 * Sets the members of Vector4Like to the specified values
 **/
export function vec4SetTo(out: Vector4Like, x: number, y: number, z: number, w: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

/**
 * Subtracts the value of the x, y, z and w elements of the current Vector4Like object
 * from the values of the x, y, z and w elements of another Vector4Like object.
 **/
export function vec4Subtract(out: Vector4Like, source: Readonly<Vector4Like>, other: Readonly<Vector4Like>): void {
  out.x = source.x - other.x;
  out.y = source.y - other.y;
  out.z = source.z - other.z;
  out.w = source.w - other.w;
}

export const vector4 = {
  create: createVector4,
  X_AXIS: VEC4_X_AXIS,
  Y_AXIS: VEC4_Y_AXIS,
  Z_AXIS: VEC4_Z_AXIS,
  W_UNIT: VEC4_W_UNIT,
  add: vec4Add,
  angleBetween: vec4AngleBetween,
  clone: vec4Clone,
  copy: vec4Copy,
  distance: vec4Distance,
  distanceSquared: vec4DistanceSquared,
  dot: vec4Dot,
  equals: vec4Equals,
  length: vec4Length,
  lengthSquared: vec4LengthSquared,
  nearEquals: vec4NearEquals,
  negate: vec4Negate,
  normalize: vec4Normalize,
  project: vec4Project,
  scale: vec4Scale,
  setTo: vec4SetTo,
  subtract: vec4Subtract,
};
