import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Vector3Like, Vector4, Vector4Like } from '@flighthq/types/contract';

/**
 * Adds the x, y, z and w components of two vector objects
 * and writes to out.
 */
export function addVector4(out: Vector4Like, a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  out.x = ax + bx;
  out.y = ay + by;
  out.z = az + bz;
  out.w = aw + bw;
}

/**
 * Clamps each component of a Vector4Like independently to [min, max].
 *
 * Safe when `out` aliases `value`, `min`, or `max`.
 */
export function clampVector4(
  out: Vector4Like,
  value: Readonly<Vector4Like>,
  min: Readonly<Vector4Like>,
  max: Readonly<Vector4Like>,
): void {
  const vx = value.x,
    vy = value.y,
    vz = value.z,
    vw = value.w;
  const minX = min.x,
    minY = min.y,
    minZ = min.z,
    minW = min.w;
  const maxX = max.x,
    maxY = max.y,
    maxZ = max.z,
    maxW = max.w;
  out.x = vx < minX ? minX : vx > maxX ? maxX : vx;
  out.y = vy < minY ? minY : vy > maxY ? maxY : vy;
  out.z = vz < minZ ? minZ : vz > maxZ ? maxZ : vz;
  out.w = vw < minW ? minW : vw > maxW ? maxW : vw;
}

export function cloneVector4(source: Readonly<Vector4Like>): Vector4 {
  return createVector4(source.x, source.y, source.z, source.w);
}

/**
 * Copies the x, y, z and w components of another vector.
 */
export function copyVector4(out: Vector4Like, source: Readonly<Vector4Like>): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

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
  const out = allocateEntity<Vector4>();
  initializeVector4(out, x ?? 0, y ?? 0, z ?? 0, w ?? 0);
  return finishEntity(out);
}

/**
 * Component-wise division of two vectors (Hadamard division). Each component of
 * `source` is divided by the corresponding component of `divisor`. Components with a
 * zero divisor produce `0` in the output.
 *
 * Safe when `out` aliases `source` or `divisor`.
 */
export function divideVector4(out: Vector4Like, source: Readonly<Vector4Like>, divisor: Readonly<Vector4Like>): void {
  const sx = source.x,
    sy = source.y,
    sz = source.z,
    sw = source.w;
  const dx = divisor.x,
    dy = divisor.y,
    dz = divisor.z,
    dw = divisor.w;
  out.x = dx !== 0 ? sx / dx : 0;
  out.y = dy !== 0 ? sy / dy : 0;
  out.z = dz !== 0 ? sz / dz : 0;
  out.w = dw !== 0 ? sw / dw : 0;
}

export function equalsVector4(
  a: Readonly<Vector4Like> | null | undefined,
  b: Readonly<Vector4Like> | null | undefined,
): boolean {
  if (!a || !b) return false;
  // Identity first, as in `equalsVector2`: a vector is equal to itself even when a component is NaN,
  // which a field-by-field comparison would deny.
  return a === b || (a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w);
}

/**
 * Returns the angle in radians between two vectors. The returned angle is the
 * smallest radian the first Vector4Like object rotates until it aligns with the
 * second Vector4Like object.
 **/
export function getVector4AngleBetween(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  const la = getVector4Length(a);
  const lb = getVector4Length(b);

  if (la === 0 || lb === 0) return NaN; // undefined angle

  const _dot = getVector4Dot(a, b) / (la * lb);
  // clamp dot to [-1, 1] to avoid floating point errors
  return Math.acos(Math.min(1, Math.max(-1, _dot)));
}

/**
 * Returns the distance between two Vector4Like objects.
 **/
export function getVector4Distance(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
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
export function getVector4DistanceSquared(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
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
export function getVector4Dot(a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/**
 * The length, magnitude, of the current Vector4Like object from the origin (0,0,0) to
 * the object's x, y, z and w coordinates. A unit vector has
 * a length or magnitude of one.
 **/
export function getVector4Length(source: Readonly<Vector4Like>): number {
  return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2);
}

/**
 * The square of the length of the current Vector4Like object, calculated using the `x`,
 * `y`, `z`, and 'w' properties. Use the `lengthSquared()`
 * method whenever possible instead of the slower `Math.sqrt()` method call of the
 * `Vector4Like.length()` method.
 **/
export function getVector4LengthSquared(source: Readonly<Vector4Like>): number {
  return source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2;
}

export function initializeVector4(out: EntityConstruction<Vector4>, x: number, y: number, z: number, w: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

/**
 * Linear interpolation between two Vector4Like objects at parameter `t` in [0, 1].
 * `t=0` returns `a`; `t=1` returns `b`.
 *
 * Safe when `out` aliases `a` or `b` (all inputs are read into locals first).
 */
export function interpolateVector4(
  out: Vector4Like,
  a: Readonly<Vector4Like>,
  b: Readonly<Vector4Like>,
  t: number,
): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  out.x = ax + t * (bx - ax);
  out.y = ay + t * (by - ay);
  out.z = az + t * (bz - az);
  out.w = aw + t * (bw - aw);
}

/**
 * Writes the per-component maximum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function maxVector4(out: Vector4Like, a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  out.x = ax > bx ? ax : bx;
  out.y = ay > by ? ay : by;
  out.z = az > bz ? az : bz;
  out.w = aw > bw ? aw : bw;
}

/**
 * Writes the per-component minimum of two vectors.
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function minVector4(out: Vector4Like, a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  out.x = ax < bx ? ax : bx;
  out.y = ay < by ? ay : by;
  out.z = az < bz ? az : bz;
  out.w = aw < bw ? aw : bw;
}

/**
 * Component-wise product of two vectors (Hadamard product).
 *
 * Safe when `out` aliases `a` or `b`.
 */
export function multiplyVector4(out: Vector4Like, a: Readonly<Vector4Like>, b: Readonly<Vector4Like>): void {
  const ax = a.x,
    ay = a.y,
    az = a.z,
    aw = a.w;
  const bx = b.x,
    by = b.y,
    bz = b.z,
    bw = b.w;
  out.x = ax * bx;
  out.y = ay * by;
  out.z = az * bz;
  out.w = aw * bw;
}

/**
 * Compares the elements of the current Vector4Like object with the elements of a
 * specified Vector4Like object to determine whether they are nearly equal.
 *
 * The two Vector4Like objects are nearly equal if the value of all the elements of the two
 * vertices are equal, or the result of the comparison is within the tolerance range.
 **/
export function nearEqualsVector4(
  a: Readonly<Vector4Like>,
  b: Readonly<Vector4Like>,
  tolerance: number = 1e-6,
): boolean {
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
export function negateVector4(out: Vector4Like, source: Readonly<Vector4Like>): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  out.x = x * -1;
  out.y = y * -1;
  out.z = z * -1;
  out.w = w * -1;
}

/**
 * Converts a Vector4Like object to a unit vector by dividing all elements
 * (x, y, z and w) by the length of the vector.
 *
 * Returns the original length.
 **/
export function normalizeVector4(out: Vector4Like, source: Readonly<Vector4Like>): number {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  const l = Math.sqrt(x ** 2 + y ** 2 + z ** 2 + w ** 2);

  if (l !== 0) {
    out.x = x / l;
    out.y = y / l;
    out.z = z / l;
    out.w = w / l;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 0;
  }

  return l;
}

/**
 * Offsets each component of the current Vector4Like object by a scalar per axis.
 **/
export function offsetVector4(
  out: Vector4Like,
  source: Readonly<Vector4Like>,
  dx: number,
  dy: number,
  dz: number,
  dw: number,
): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  out.x = x + dx;
  out.y = y + dy;
  out.z = z + dz;
  out.w = w + dw;
}

/**
 * Divides the value of the `x`, `y`, and `z` properties of the current Vector4Like
 * object by the value of its `w` property.
 **/
export function projectVector4(out: Vector3Like, source: Readonly<Vector4Like>): void {
  out.x = source.x / source.w;
  out.y = source.y / source.w;
  out.z = source.z / source.w;
}

/**
 * Reflects an incident vector about a unit normal. The result is the reflection of
 * `incident` across the hyperplane whose normal is `normal`.
 *
 * Formula: out = incident - 2 * dot(incident, normal) * normal
 *
 * Safe when `out` aliases `incident` or `normal`.
 */
export function reflectVector4(out: Vector4Like, incident: Readonly<Vector4Like>, normal: Readonly<Vector4Like>): void {
  const ix = incident.x,
    iy = incident.y,
    iz = incident.z,
    iw = incident.w;
  const nx = normal.x,
    ny = normal.y,
    nz = normal.z,
    nw = normal.w;
  const twoDot = 2 * (ix * nx + iy * ny + iz * nz + iw * nw);
  out.x = ix - twoDot * nx;
  out.y = iy - twoDot * ny;
  out.z = iz - twoDot * nz;
  out.w = iw - twoDot * nw;
}

/**
 * Scales the current Vector4Like object by a scalar, a magnitude. The Vector4Like object's
 * x, y, z and w elements are multiplied by the provided scalar number.
 **/
export function scaleVector4(out: Vector4Like, source: Readonly<Vector4Like>, scalar: number): void {
  const x = source.x,
    y = source.y,
    z = source.z,
    w = source.w;
  out.x = x * scalar;
  out.y = y * scalar;
  out.z = z * scalar;
  out.w = w * scalar;
}

/**
 * Sets the members of Vector4Like to the specified values
 **/
export function setVector4(out: Vector4Like, x: number, y: number, z: number, w: number): void {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

/**
 * Reads a Vector4Like from a Float32Array at an element offset.
 */
export function setVector4FromFloat32Array(out: Vector4Like, offset: number, source: Readonly<Float32Array>): void {
  out.x = source[offset];
  out.y = source[offset + 1];
  out.z = source[offset + 2];
  out.w = source[offset + 3];
}

/**
 * Copies the x, y, and z components of a Vector3Like into a Vector4Like, setting w to the
 * given value (default 0). Use `w = 1` for a position, `w = 0` for a direction.
 *
 * Safe when `out` aliases any part of `source`.
 */
export function setVector4FromVector3(out: Vector4Like, source: Readonly<Vector3Like>, w = 0): void {
  const x = source.x,
    y = source.y,
    z = source.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

/**
 * Subtracts the value of the x, y, z and w elements of the current Vector4Like object
 * from the values of the x, y, z and w elements of another Vector4Like object.
 **/
export function subtractVector4(out: Vector4Like, source: Readonly<Vector4Like>, other: Readonly<Vector4Like>): void {
  const sx = source.x,
    sy = source.y,
    sz = source.z,
    sw = source.w;
  const ox = other.x,
    oy = other.y,
    oz = other.z,
    ow = other.w;
  out.x = sx - ox;
  out.y = sy - oy;
  out.z = sz - oz;
  out.w = sw - ow;
}

/**
 * Writes a Vector4Like into a Float32Array at an element offset.
 */
export function writeVector4ToFloat32Array(out: Float32Array, offset: number, source: Readonly<Vector4Like>): void {
  out[offset] = source.x;
  out[offset + 1] = source.y;
  out[offset + 2] = source.z;
  out[offset + 3] = source.w;
}

export const VECTOR4_W_UNIT: Readonly<Vector4> = createVector4(0, 0, 0, 1);
export const VECTOR4_X_AXIS: Readonly<Vector4> = createVector4(1, 0, 0, 0);
export const VECTOR4_Y_AXIS: Readonly<Vector4> = createVector4(0, 1, 0, 0);
export const VECTOR4_Z_AXIS: Readonly<Vector4> = createVector4(0, 0, 1, 0);
