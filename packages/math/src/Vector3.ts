import type { Vector2 as Vector2Like, Vector3 as Vector3Like } from '@flighthq/types';

/**
 * The Vector3 class represents a point or a location in the three-dimensional space using
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
 * - `X_AXIS = new Vector3(1, 0, 0);`
 * - `Y_AXIS = new Vector3(0, 1, 0);`
 * - `Z_AXIS = new Vector3(0, 0, 1);`
 * - `length = Math.sqrt(x ** 2 + y ** 2 + z ** 2);`
 * - `lengthSquared = x ** 2 + y ** 2 + z ** 2;`
 */
export default class Vector3 implements Vector3Like {
  x: number = 0;
  y: number = 0;
  z: number = 0;

  constructor(x?: number, y?: number, z?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    if (z !== undefined) this.z = z;
  }

  /**
   * Adds the x, y and z components of two vector objects
   * and writes to out.
   */
  static add(out: Vector3Like, a: Vector3Like, b: Vector3Like): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
  }

  add(source: Vector3Like): Vector3 {
    this.x += source.x;
    this.y += source.y;
    this.z += source.z;
    return this;
  }

  /**
   * Returns the angle in radians between two vectors. The returned angle is the
   * smallest radian the first Vector3 object rotates until it aligns with the
   * second Vector3 object.
   **/
  static angleBetween(a: Vector3Like, b: Vector3Like): number {
    const la = this.length(a);
    const lb = this.length(b);

    if (la === 0 || lb === 0) return NaN; // undefined angle

    const dot = this.dot(a, b) / (la * lb);
    // clamp dot to [-1, 1] to avoid floating point errors
    return Math.acos(Math.min(1, Math.max(-1, dot)));
  }

  static clone(source: Vector3Like): Vector3 {
    return new Vector3(source.x, source.y, source.z);
  }

  /**
   * Copies the x, y and z components of a vector.
   */
  static copy(out: Vector3Like, source: Vector3Like): void {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
  }

  /**
   * Copies the x, y and z components of another vector.
   */
  copyFrom(source: Vector3Like): Vector3 {
    this.x = source.x;
    this.y = source.y;
    this.z = source.z;
    return this;
  }

  /**
   * Writes a Vector3 object that is perpendicular (at a right angle) to the
   * current Vector3 and another Vector3 object. If the returned Vector3 object's
   * coordinates are (0,0,0), then the two Vector3 objects are parallel to each other.
   **/
  static cross(out: Vector3Like, source: Vector3Like, other: Vector3Like): void {
    const x = source.y * other.z - source.z * other.y;
    const y = source.z * other.x - source.x * other.z;
    const z = source.x * other.y - source.y * other.x;
    out.x = x;
    out.y = y;
    out.z = z;
  }

  cross(source: Vector3Like): Vector3 {
    Vector3.cross(this, this, source);
    return this;
  }

  /**
   * Returns the distance between two Vector3 objects.
   **/
  static distance(a: Vector3Like, b: Vector3Like): number {
    const x: number = b.x - a.x;
    const y: number = b.y - a.y;
    const z: number = b.z - a.z;

    return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  }

  /**
   * Returns the distance (squared) between two Vector3 objects.
   *
   * This avoids Math.sqrt for better performance.
   **/
  static distanceSquared(a: Vector3Like, b: Vector3Like): number {
    const x: number = b.x - a.x;
    const y: number = b.y - a.y;
    const z: number = b.z - a.z;

    return x ** 2 + y ** 2 + z ** 2;
  }

  /**
   * If the current Vector3 object and the one specified as the parameter are unit
   * vertices, this method returns the cosine of the angle between the two vertices.
   * Unit vertices are vertices that point to the same direction but their length is
   * one. They remove the length of the vector as a factor in the result. You can use
   * the `normalize()` method to convert a vector to a unit vector.
   **/
  static dot(a: Vector3Like, b: Vector3Like): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  static equals(a: Vector3Like | null | undefined, b: Vector3Like | null | undefined): boolean {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }

  /**
   * The length, magnitude, of the current Vector3 object from the origin (0,0,0) to
   * the object's x, y, and z coordinates. The `w` property is ignored. A unit vector has
   * a length or magnitude of one.
   **/
  static length(source: Vector3Like): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2);
  }

  /**
   * The square of the length of the current Vector3 object, calculated using the `x`,
   * `y`, and `z` properties. The `w` property is ignored. Use the `lengthSquared()`
   * method whenever possible instead of the slower `Math.sqrt()` method call of the
   * `Vector3.length()` method.
   **/
  static lengthSquared(source: Vector3Like): number {
    return source.x ** 2 + source.y ** 2 + source.z ** 2;
  }

  /**
   * Compares the elements of the current Vector3 object with the elements of a
   * specified Vector3 object to determine whether they are nearly equal.
   *
   * The two Vector3 objects are nearly equal if the value of all the elements of the two
   * vertices are equal, or the result of the comparison is within the tolerance range.
   **/
  static nearEquals(a: Vector3Like, b: Vector3Like, tolerance: number = 1e-6): boolean {
    return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance && Math.abs(a.z - b.z) < tolerance;
  }

  /**
   * Sets the current Vector3 object to its inverse. The inverse object is also
   * considered the opposite of the original object. The value of the `x`, `y`, and `z`
   * properties of the current Vector3 object is changed to -x, -y, and -z.
   **/
  static negate(out: Vector3Like, source: Vector3Like): void {
    out.x = source.x * -1;
    out.y = source.y * -1;
    out.z = source.z * -1;
  }

  negate(): Vector3 {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    return this;
  }

  /**
   * Converts a Vector3 object to a unit vector by dividing the first three elements
   * (x, y, z) by the length of the vector.
   *
   * Returns the original length.
   **/
  static normalize(out: Vector3Like, source: Vector3Like): number {
    const l = this.length(source);

    if (l !== 0) {
      out.x = source.x / l;
      out.y = source.y / l;
      out.z = source.z / l;
    }

    return l;
  }

  normalize(): Vector3 {
    Vector3.normalize(this, this);
    return this;
  }

  /**
   * Divides the value of the `x` and `y` properties of the current Vector3
   * object by the value of its `z` property.
   **/
  static project(out: Vector2Like, source: Vector3Like): void {
    out.x = source.x / source.z;
    out.y = source.y / source.z;
  }

  /**
   * Scales the current Vector3 object by a scalar, a magnitude. The Vector3 object's
   * x, y, and z elements are multiplied by the provided scalar number.
   **/
  static scale(out: Vector3Like, source: Vector3Like, scalar: number): void {
    out.x = source.x * scalar;
    out.y = source.y * scalar;
    out.z = source.z * scalar;
  }

  scale(scalar: number): Vector3 {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  /**
   * Sets the members of Vector3 to the specified values
   **/
  static set(out: Vector3Like, x: number, y: number, z: number): void {
    out.x = x;
    out.y = y;
    out.z = z;
  }

  set(x: number, y: number, z: number): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Subtracts the value of the x, y, and z elements of the current Vector3 object
   * from the values of the x, y, and z elements of another Vector3 object.
   **/
  static subtract(out: Vector3Like, source: Vector3Like, other: Vector3Like): void {
    out.x = source.x - other.x;
    out.y = source.y - other.y;
    out.z = source.z - other.z;
  }

  subtract(source: Vector3Like): Vector3 {
    this.x -= source.x;
    this.y -= source.y;
    this.z -= source.z;
    return this;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector3 {
    return new Vector3(1, 0, 0);
  }

  static get Y_AXIS(): Vector3 {
    return new Vector3(0, 1, 0);
  }

  static get Z_AXIS(): Vector3 {
    return new Vector3(0, 0, 1);
  }

  get length(): number {
    return Vector3.length(this);
  }

  get lengthSquared(): number {
    return Vector3.lengthSquared(this);
  }
}
