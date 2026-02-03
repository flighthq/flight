import type { Vector3D as Vector3DLike } from '@flighthq/types';

/**
 * The Vector3D class represents a point or a location in the three-dimensional space using
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
 * - `X_AXIS = new Vector3D(1, 0, 0);`
 * - `Y_AXIS = new Vector3D(0, 1, 0);`
 * - `Z_AXIS = new Vector3D(0, 0, 1);`
 * - `length = Math.sqrt(x ** 2 + y ** 2 + z ** 2);`
 * - `lengthSquared = x ** 2 + y ** 2 + z ** 2;`
 */
export default class Vector3D implements Vector3DLike {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  w: number = 0;

  constructor(x?: number, y?: number, z?: number, w?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    if (z !== undefined) this.z = z;
    if (w !== undefined) this.w = w;
  }

  /**
   * Adds the x, y and z components of two vector objects.
   *
   * The w component is ignored.
   *
   * A new Vector3D is returned.
   * @see addTo
   */
  static add(a: Vector3DLike, b: Vector3DLike): Vector3D {
    const out = new Vector3D();
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    return out;
  }

  /**
   * Adds the x, y and z components of two vector objects
   * and writes to out.
   *
   * The w component is ignored.
   */
  static addTo(out: Vector3DLike, a: Vector3DLike, b: Vector3DLike): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
  }

  /**
   * Returns the angle in radians between two vectors. The returned angle is the
   * smallest radian the first Vector3D object rotates until it aligns with the
   * second Vector3D object.
   **/
  static angleBetween(a: Vector3DLike, b: Vector3DLike): number {
    const la = this.length(a);
    const lb = this.length(b);
    let dot = this.dotProduct(a, b);

    if (la !== 0) {
      dot /= la;
    }

    if (lb !== 0) {
      dot /= lb;
    }

    return Math.acos(dot);
  }

  static clone(source: Vector3DLike): Vector3D {
    return new Vector3D(source.x, source.y, source.z, source.w);
  }

  /**
   * Copies the x, y and z components of another vector.
   *
   * The w component is ignored.
   */
  static copyFrom(source: Vector3DLike, out: Vector3DLike): void {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
  }

  /**
   * Copies the x, y and z components of another vector.
   *
   * The w component is ignored.
   */
  static copyTo(out: Vector3DLike, source: Vector3DLike): void {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
  }

  /**
   * Returns a new Vector3D object that is perpendicular (at a right angle) to the
   * current Vector3D and another Vector3D object. If the returned Vector3D object's
   * coordinates are (0,0,0), then the two Vector3D objects are parallel to each other.
   *
   * The w component is written to 1.
   *
   * A new Vector3D is returned.
   * @see crossProductTo
   **/
  static crossProduct(source: Vector3DLike, other: Vector3DLike): Vector3D {
    const out = new Vector3D();
    this.crossProductTo(out, source, other);
    return out;
  }

  /**
   * Writes a Vector3D object that is perpendicular (at a right angle) to the
   * current Vector3D and another Vector3D object. If the returned Vector3D object's
   * coordinates are (0,0,0), then the two Vector3D objects are parallel to each other.
   *
   * The w component is written to 1.
   **/
  static crossProductTo(out: Vector3DLike, source: Vector3DLike, other: Vector3DLike): void {
    const x = source.y * other.z - source.z * other.y;
    const y = source.z * other.x - source.x * other.z;
    const z = source.x * other.y - source.y * other.x;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = 1;
  }

  /**
   * Decrements the value of the x, y, and z elements of the current Vector3D object by
   * the values of the x, y, and z elements of specified Vector3D object.
   *
   * The w component is ignored.
   **/
  static decrementBy(target: Vector3DLike, source: Vector3DLike): void {
    target.x -= source.x;
    target.y -= source.y;
    target.z -= source.z;
  }

  static decrementTo(out: Vector3DLike, a: Vector3DLike, b: Vector3DLike): void {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
  }

  /**
   * Returns the distance between two Vector3D objects.
   **/
  static distance(a: Vector3DLike, b: Vector3DLike): number {
    const x: number = b.x - a.x;
    const y: number = b.y - a.y;
    const z: number = b.z - a.z;

    return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  }

  /**
   * Returns the distance (squared) between two Vector3D objects.
   *
   * This avoids Math.sqrt for better performance.
   **/
  static distanceSquared(a: Vector3DLike, b: Vector3DLike): number {
    const x: number = b.x - a.x;
    const y: number = b.y - a.y;
    const z: number = b.z - a.z;

    return x ** 2 + y ** 2 + z ** 2;
  }

  /**
   * If the current Vector3D object and the one specified as the parameter are unit
   * vertices, this method returns the cosine of the angle between the two vertices.
   * Unit vertices are vertices that point to the same direction but their length is
   * one. They remove the length of the vector as a factor in the result. You can use
   * the `normalize()` method to convert a vector to a unit vector.
   *
   * The w component is ignored.
   **/
  static dotProduct(a: Vector3DLike, b: Vector3DLike): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  static equals(a: Vector3DLike, b: Vector3DLike, compareW: boolean = false): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && (!compareW || a.w === b.w);
  }

  /**
   * Increments the value of the x, y, and z elements of the current Vector3D object by
   * the values of the x, y, and z elements of a specified Vector3D object.
   *
   * The w component is ignored.
   **/
  static incrementBy(target: Vector3DLike, source: Vector3DLike): void {
    target.x += source.x;
    target.y += source.y;
    target.z += source.z;
  }

  static incrementTo(out: Vector3DLike, a: Vector3DLike, b: Vector3DLike): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
  }

  /**
   * The length, magnitude, of the current Vector3D object from the origin (0,0,0) to
   * the object's x, y, and z coordinates. The `w` property is ignored. A unit vector has
   * a length or magnitude of one.
   **/
  static length(source: Vector3DLike): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2);
  }

  /**
   * The square of the length of the current Vector3D object, calculated using the `x`,
   * `y`, and `z` properties. The `w` property is ignored. Use the `lengthSquared()`
   * method whenever possible instead of the slower `Math.sqrt()` method call of the
   * `Vector3D.length()` method.
   **/
  static lengthSquared(source: Vector3DLike): number {
    return source.x ** 2 + source.y ** 2 + source.z ** 2;
  }

  /**
   * Compares the elements of the current Vector3D object with the elements of a
   * specified Vector3D object to determine whether they are nearly equal.
   *
   * The two Vector3D objects are nearly equal if the value of all the elements of the two
   * vertices are equal, or the result of the comparison is within the tolerance range.
   **/
  static nearEquals(a: Vector3DLike, b: Vector3DLike, tolerance: number, compareW: boolean = false): boolean {
    return (
      Math.abs(a.x - b.x) < tolerance &&
      Math.abs(a.y - b.y) < tolerance &&
      Math.abs(a.z - b.z) < tolerance &&
      (!compareW || Math.abs(a.w - b.w) < tolerance)
    );
  }

  /**
   * Sets the current Vector3D object to its inverse. The inverse object is also
   * considered the opposite of the original object. The value of the `x`, `y`, and `z`
   * properties of the current Vector3D object is changed to -x, -y, and -z.
   **/
  static negate(target: Vector3DLike): void {
    target.x *= -1;
    target.y *= -1;
    target.z *= -1;
  }

  static negateTo(out: Vector3DLike, source: Vector3DLike): void {
    out.x = source.x * -1;
    out.y = source.y * -1;
    out.z = source.z * -1;
  }

  /**
   * Converts a Vector3D object to a unit vector by dividing the first three elements
   * (x, y, z) by the length of the vector.
   *
   * Returns the original length.
   **/
  static normalize(target: Vector3DLike): number {
    const l = this.length(target);

    if (l !== 0) {
      target.x /= l;
      target.y /= l;
      target.z /= l;
    }

    return l;
  }

  static normalizeTo(out: Vector3DLike, source: Vector3DLike): number {
    const l = this.length(source);

    if (l !== 0) {
      out.x = source.x / l;
      out.y = source.y / l;
      out.z = source.z / l;
    }

    return l;
  }

  /**
   * Divides the value of the `x`, `y`, and `z` properties of the current Vector3D
   * object by the value of its `w` property.
   **/
  static project(target: Vector3DLike): void {
    target.x /= target.w;
    target.y /= target.w;
    target.z /= target.w;
  }

  static projectTo(out: Vector3DLike, source: Vector3DLike): void {
    out.x = source.x / source.w;
    out.y = source.y / source.w;
    out.z = source.z / source.w;
  }

  /**
   * Scales the current Vector3D object by a scalar, a magnitude. The Vector3D object's
   * x, y, and z elements are multiplied by the provided scalar number.
   *
   * The w component is ignored.
   **/
  static scaleBy(target: Vector3DLike, scalar: number): void {
    target.x *= scalar;
    target.y *= scalar;
    target.z *= scalar;
  }

  static scaleTo(out: Vector3DLike, source: Vector3DLike, scalar: number): void {
    out.x = source.x * scalar;
    out.y = source.y * scalar;
    out.z = source.z * scalar;
  }

  /**
   * Sets the members of Vector3D to the specified values
   *
   * If you do not pass a w value, the w component will be ignored.
   **/
  static setTo(out: Vector3DLike, x: number, y: number, z: number, w?: number): void {
    out.x = x;
    out.y = y;
    out.z = z;
    if (w !== undefined) out.w = w;
  }

  /**
   * Subtracts the value of the x, y, and z elements of the current Vector3D object
   * from the values of the x, y, and z elements of another Vector3D object.
   *
   * The w component is ignored.
   **/
  static subtract(source: Vector3DLike, other: Vector3DLike): Vector3D {
    const out = new Vector3D();
    out.x = source.x - other.x;
    out.y = source.y - other.y;
    out.z = source.z - other.z;
    return out;
  }

  static subtractTo(out: Vector3DLike, source: Vector3DLike, other: Vector3DLike): void {
    out.x = source.x - other.x;
    out.y = source.y - other.y;
    out.z = source.z - other.z;
  }

  toString(): string {
    return `Vector3D(${this.x}, ${this.y}, ${this.z})`;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector3D {
    return new Vector3D(1, 0, 0);
  }

  static get Y_AXIS(): Vector3D {
    return new Vector3D(0, 1, 0);
  }

  static get Z_AXIS(): Vector3D {
    return new Vector3D(0, 0, 1);
  }

  get length(): number {
    return Vector3D.length(this);
  }

  get lengthSquared(): number {
    return Vector3D.lengthSquared(this);
  }
}
