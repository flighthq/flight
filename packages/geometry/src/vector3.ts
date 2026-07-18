import { createEntity } from '@flighthq/entity';
import type { Vector2Like, Vector3, Vector3Like, Vector4Like } from '@flighthq/types';

/**
 * Adds the x, y and z components of two vector objects
 * and writes to out.
 */
export function addVector3(out: Vector3Like, a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): void {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
}

/**
 * Clamps each component of a Vector3Like independently to [min, max].
 *
 * Safe when `out` aliases `value`, `min`, or `max`.
 */
export function clampVector3(
  out: Vector3Like,
  value: Readonly<Vector3Like>,
  min: Readonly<Vector3Like>,
  max: Readonly<Vector3Like>,
): void {
  const vx = value.x,
    vy = value.y,
    vz = value.z;
  const minX = min.x,
    minY = min.y,
    minZ = min.z;
  const maxX = max.x,
    maxY = max.y,
    maxZ = max.z;
  out.x = vx < minX ? minX : vx > maxX ? maxX : vx;
  out.y = vy < minY ? minY : vy > maxY ? maxY : vy;
  out.z = vz < minZ ? minZ : vz > maxZ ? maxZ : vz;
}

export function cloneVector3(source: Readonly<Vector3Like>): Vector3 {
  return createVector3(source.x, source.y, source.z);
}

/**
 * Copies the x, y and z components of a vector.
 */
export function copyVector3(out: Vector3Like, source: Readonly<Vector3Like>): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
}

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
export function createVector3(x?: number, y?: number, z?: number): Vector3 {
  return createEntity({ x: x ?? 0, y: y ?? 0, z: z ?? 0 });
}

/**
 * Creates a Vector3 from spherical coordinates (physics convention: radius, inclination θ from
 * +Y axis, azimuth φ from +X axis in the XZ plane).
 *
 * - `theta` is the polar angle measured from the +Y axis (0 = north pole, π = south pole).
 * - `phi` is the azimuthal angle measured from the +X axis in the XZ plane.
 */
export function createVector3FromSpherical(radius: number, theta: number, phi: number): Vector3 {
  const out = createVector3();
  setVector3FromSpherical(out, radius, theta, phi);
  return out;
}

/**
 * Writes a Vector3Like object that is perpendicular (at a right angle) to the
 * current Vector3Like and another Vector3Like object. If the returned Vector3Like object's
 * coordinates are (0,0,0), then the two Vector3Like objects are parallel to each other.
 **/
export function crossVector3(out: Vector3Like, source: Readonly<Vector3Like>, other: Readonly<Vector3Like>): void {
  const x = source.y * other.z - source.z * other.y;
  const y = source.z * other.x - source.x * other.z;
  const z = source.x * other.y - source.y * other.x;
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Component-wise division of two vectors (Hadamard division). Each component of
 * `source` is divided by the corresponding component of `divisor`. Components with a
 * zero divisor produce `0` in the output.
 *
 * Safe when `out` aliases `source` or `divisor`.
 */
export function divideVector3(out: Vector3Like, source: Readonly<Vector3Like>, divisor: Readonly<Vector3Like>): void {
  const sx = source.x,
    sy = source.y,
    sz = source.z;
  const dx = divisor.x,
    dy = divisor.y,
    dz = divisor.z;
  out.x = dx !== 0 ? sx / dx : 0;
  out.y = dy !== 0 ? sy / dy : 0;
  out.z = dz !== 0 ? sz / dz : 0;
}

export function equalsVector3(
  a: Readonly<Vector3Like> | null | undefined,
  b: Readonly<Vector3Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector3Like object rotates until it aligns with the
 * second Vector3Like object.
 **/
export function getVector3AngleBetween(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  const la = getVector3Length(a);
  const lb = getVector3Length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = getVector3Dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

/**
 * Returns the distance between two Vector3Like objects.
 **/
export function getVector3Distance(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
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
export function getVector3DistanceSquared(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
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
export function getVector3Dot(a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * The length, magnitude, of the current Vector3Like object from the origin (0,0,0) to
 * the object's x, y, and z coordinates. The `w` property is ignored. A unit vector has
 * a length or magnitude of one.
 **/
export function getVector3Length(source: Readonly<Vector3Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2);
}

/**
 * The square of the length of the current Vector3Like object, calculated using the `x`,
 * `y`, and `z` properties. The `w` property is ignored. Use the `lengthSquared()`
 * method whenever possible instead of the slower `Math.sqrt()` method call of the
 * `Vector3Like.length()` method.
 **/
export function getVector3LengthSquared(source: Readonly<Vector3Like>): number {
  return source.x ** 2 + source.y ** 2 + source.z ** 2;
}

/**
 * Reads the spherical coordinates (radius, theta, phi) from a Vector3Like. Uses the same
 * convention as `setVector3FromSpherical` / `createVector3FromSpherical`:
 * - `theta` is the polar angle from the +Y axis (0 = north pole, π = south pole).
 * - `phi` is the azimuthal angle from the +X axis in the XZ plane.
 *
 * Writes to `out` as (x=radius, y=theta, z=phi).
 */
export function getVector3Spherical(out: Vector3Like, source: Readonly<Vector3Like>): void {
  const x = source.x,
    y = source.y,
    z = source.z;
  const radius = Math.sqrt(x * x + y * y + z * z);
  if (radius === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return;
  }
  out.x = radius;
  out.y = Math.acos(Math.min(1, Math.max(-1, y / radius)));
  out.z = Math.atan2(z, x);
}

/**
 * Linear interpolation between two Vector3Like objects at parameter `t` in [0, 1].
 * `t=0` returns `a`; `t=1` returns `b`.
 *
 * Safe when `out` aliases `a` or `b` (all inputs are read into locals first).
 */
export function interpolateVector3(
  out: Vector3Like,
  a: Readonly<Vector3Like>,
  b: Readonly<Vector3Like>,
  t: number,
): void {
  const ax = a.x,
    ay = a.y,
    az = a.z;
  out.x = ax + t * (b.x - ax);
  out.y = ay + t * (b.y - ay);
  out.z = az + t * (b.z - az);
}

/**
 * Writes the per-component maximum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function maxVector3(out: Vector3Like, a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): void {
  out.x = a.x > b.x ? a.x : b.x;
  out.y = a.y > b.y ? a.y : b.y;
  out.z = a.z > b.z ? a.z : b.z;
}

/**
 * Writes the per-component minimum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function minVector3(out: Vector3Like, a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): void {
  out.x = a.x < b.x ? a.x : b.x;
  out.y = a.y < b.y ? a.y : b.y;
  out.z = a.z < b.z ? a.z : b.z;
}

/**
 * Component-wise product of two vectors (Hadamard product).
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function multiplyVector3(out: Vector3Like, a: Readonly<Vector3Like>, b: Readonly<Vector3Like>): void {
  out.x = a.x * b.x;
  out.y = a.y * b.y;
  out.z = a.z * b.z;
}

/**
 * Compares the elements of the current Vector3Like object with the elements of a
 * specified Vector3Like object to determine whether they are nearly equal.
 *
 * The two Vector3Like objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function nearEqualsVector3(
  a: Readonly<Vector3Like>,
  b: Readonly<Vector3Like>,
  tolerance: number = 1e-6,
): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance && Math.abs(a.z - b.z) < tolerance;
}

/**
 * Sets the current Vector3Like object to its inverse. The inverse object is also
 * considered the opposite of the original object. The value of the `x`, `y`, and `z`
 * properties of the current Vector3Like object is changed to -x, -y, and -z.
 **/
export function negateVector3(out: Vector3Like, source: Readonly<Vector3Like>): void {
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
export function normalizeVector3(out: Vector3Like, source: Readonly<Vector3Like>): number {
  const l = getVector3Length(source);

  if (l !== 0) {
    out.x = source.x / l;
    out.y = source.y / l;
    out.z = source.z / l;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 0;
  }

  return l;
}

/**
 * Offsets each component of the current Vector3Like object by a scalar per axis.
 **/
export function offsetVector3(
  out: Vector3Like,
  source: Readonly<Vector3Like>,
  dx: number,
  dy: number,
  dz: number,
): void {
  out.x = source.x + dx;
  out.y = source.y + dy;
  out.z = source.z + dz;
}

/**
 * Divides the value of the `x` and `y` properties of the current Vector3Like
 * object by the value of its `z` property.
 **/
export function projectVector3(out: Vector2Like, source: Readonly<Vector3Like>): void {
  out.x = source.x / source.z;
  out.y = source.y / source.z;
}

/**
 * Reflects an incident vector about a unit normal. The result is the reflection of
 * `incident` across the plane whose normal is `normal`.
 *
 * Formula: out = incident - 2 * dot(incident, normal) * normal
 *
 * Safe when `out` aliases `incident` or `normal`.
 */
export function reflectVector3(out: Vector3Like, incident: Readonly<Vector3Like>, normal: Readonly<Vector3Like>): void {
  const ix = incident.x,
    iy = incident.y,
    iz = incident.z;
  const nx = normal.x,
    ny = normal.y,
    nz = normal.z;
  const twoDot = 2 * (ix * nx + iy * ny + iz * nz);
  out.x = ix - twoDot * nx;
  out.y = iy - twoDot * ny;
  out.z = iz - twoDot * nz;
}

/**
 * Scales the current Vector3Like object by a scalar, a magnitude. The Vector3Like object's
 * x, y, and z elements are multiplied by the provided scalar number.
 **/
export function scaleVector3(out: Vector3Like, source: Readonly<Vector3Like>, scalar: number): void {
  out.x = source.x * scalar;
  out.y = source.y * scalar;
  out.z = source.z * scalar;
}

/**
 * Sets the members of Vector3Like to the specified values
 **/
export function setVector3(out: Vector3Like, x: number, y: number, z: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Reads a Vector3Like from a Float32Array at a byte offset.
 */
export function setVector3FromFloat32Array(out: Vector3Like, offset: number, source: Readonly<Float32Array>): void {
  out.x = source[offset];
  out.y = source[offset + 1];
  out.z = source[offset + 2];
}

/**
 * Writes a Vector3Like into spherical coordinates.
 * Uses the physics convention: theta is polar angle from +Y, phi is azimuthal from +X in XZ.
 */
export function setVector3FromSpherical(out: Vector3Like, radius: number, theta: number, phi: number): void {
  const sinTheta = Math.sin(theta);
  out.x = radius * sinTheta * Math.cos(phi);
  out.y = radius * Math.cos(theta);
  out.z = radius * sinTheta * Math.sin(phi);
}

/**
 * Copies the x, y, and z components of a Vector4Like into a Vector3Like, dropping the w component.
 * For perspective-correct results (when w ≠ 1) use projectVector4 instead, which performs the
 * perspective divide.
 *
 * Safe when `out` aliases the same memory as `source`.
 */
export function setVector3FromVector4(out: Vector3Like, source: Readonly<Vector4Like>): void {
  const x = source.x,
    y = source.y,
    z = source.z;
  out.x = x;
  out.y = y;
  out.z = z;
}

/**
 * Subtracts the value of the x, y, and z elements of the current Vector3Like object
 * from the values of the x, y, and z elements of another Vector3Like object.
 **/
export function subtractVector3(out: Vector3Like, source: Readonly<Vector3Like>, other: Readonly<Vector3Like>): void {
  out.x = source.x - other.x;
  out.y = source.y - other.y;
  out.z = source.z - other.z;
}

/**
 * Transforms a Vector3Like by a Matrix3 (column-major storage). Useful for transforming normals by a
 * normal matrix.
 *
 * Safe when `out` aliases `source`.
 */
export function transformVector3ByMatrix3(
  out: Vector3Like,
  source: Readonly<Vector3Like>,
  matrix: Readonly<{ m: Readonly<Float32Array> }>,
): void {
  const m = matrix.m;
  const x = source.x,
    y = source.y,
    z = source.z;
  out.x = m[0] * x + m[3] * y + m[6] * z;
  out.y = m[1] * x + m[4] * y + m[7] * z;
  out.z = m[2] * x + m[5] * y + m[8] * z;
}

/**
 * Writes a Vector3Like into a Float32Array at a byte offset.
 */
export function writeVector3ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Vector3Like>): void {
  out[offset] = source.x;
  out[offset + 1] = source.y;
  out[offset + 2] = source.z;
}

export const VECTOR3_X_AXIS: Readonly<Vector3> = createVector3(1, 0, 0);
export const VECTOR3_Y_AXIS: Readonly<Vector3> = createVector3(0, 1, 0);
export const VECTOR3_Z_AXIS: Readonly<Vector3> = createVector3(0, 0, 1);
