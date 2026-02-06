import type { Vector2 as Vector2Like, Vector3 as Vector3Like, Vector4 as Vector4Like } from '@flighthq/types';

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
export default class Vector4 implements Vector4Like {
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
   * A new Vector4 is returned.
   * @see addTo
   */
  static add(a: Vector4Like, b: Vector4Like): Vector4 {
    const out = new Vector4();
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    out.w = a.w + b.w;
    return out;
  }

  /**
   * Adds the x, y and z components of two vector objects
   * and writes to out.
   *
   * The w component is ignored.
   */
  static addTo(out: Vector4Like, a: Vector4Like, b: Vector4Like): void {
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
  static angleBetween(a: Vector4Like, b: Vector4Like): number {
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

  static clone(source: Vector4Like): Vector4 {
    return new Vector4(source.x, source.y, source.z, source.w);
  }

  /**
   * Copies the x, y and z components of another vector.
   *
   * The w component is ignored.
   */
  static copyFrom(source: Vector4Like, out: Vector4Like): void {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
    out.w = source.w;
  }

  /**
   * Copies the x, y and z components of another vector.
   *
   * The w component is ignored.
   */
  static copyTo(out: Vector4Like, source: Vector4Like): void {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
    out.w = source.w;
  }

  /**
   * Decrements the value of the x, y, and z elements of the current Vector4 object by
   * the values of the x, y, and z elements of specified Vector4 object.
   *
   * The w component is ignored.
   **/
  static decrementBy(target: Vector4Like, source: Vector4Like): void {
    target.x -= source.x;
    target.y -= source.y;
    target.z -= source.z;
    target.w -= source.w;
  }

  static decrementTo(out: Vector4Like, a: Vector4Like, b: Vector4Like): void {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    out.z = a.z - b.z;
    out.w = a.w - b.w;
  }

  /**
   * Returns the distance between two Vector4 objects.
   **/
  static distance(a: Vector4Like, b: Vector4Like): number {
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
  static distanceSquared(a: Vector4Like, b: Vector4Like): number {
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
   *
   * The w component is ignored.
   **/
  static dotProduct(a: Vector4Like, b: Vector4Like): number {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  }

  static equals(a: Vector4Like, b: Vector4Like): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w;
  }

  static fromVec2(source: Vector2Like): Vector4 {
    return new Vector4(source.x, source.y);
  }

  static fromVec3(source: Vector3Like): Vector4 {
    return new Vector4(source.x, source.y, source.z);
  }

  /**
   * Increments the value of the x, y, and z elements of the current Vector4 object by
   * the values of the x, y, and z elements of a specified Vector4 object.
   *
   * The w component is ignored.
   **/
  static incrementBy(target: Vector4Like, source: Vector4Like): void {
    target.x += source.x;
    target.y += source.y;
    target.z += source.z;
    target.w += source.w;
  }

  static incrementTo(out: Vector4Like, a: Vector4Like, b: Vector4Like): void {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    out.z = a.z + b.z;
    out.w = a.w + b.w;
  }

  /**
   * The length, magnitude, of the current Vector4 object from the origin (0,0,0) to
   * the object's x, y, z and w coordinates. A unit vector has
   * a length or magnitude of one.
   **/
  static length(source: Vector4Like): number {
    return Math.sqrt(source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2);
  }

  /**
   * The square of the length of the current Vector4 object, calculated using the `x`,
   * `y`, `z`, and 'w' properties. Use the `lengthSquared()`
   * method whenever possible instead of the slower `Math.sqrt()` method call of the
   * `Vector4.length()` method.
   **/
  static lengthSquared(source: Vector4Like): number {
    return source.x ** 2 + source.y ** 2 + source.z ** 2 + source.w ** 2;
  }

  /**
   * Compares the elements of the current Vector4 object with the elements of a
   * specified Vector4 object to determine whether they are nearly equal.
   *
   * The two Vector4 objects are nearly equal if the value of all the elements of the two
   * vertices are equal, or the result of the comparison is within the tolerance range.
   **/
  static nearEquals(a: Vector4Like, b: Vector4Like, tolerance: number): boolean {
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
  static negate(target: Vector4Like): void {
    target.x *= -1;
    target.y *= -1;
    target.z *= -1;
    target.w *= -1;
  }

  static negateTo(out: Vector4Like, source: Vector4Like): void {
    out.x = source.x * -1;
    out.y = source.y * -1;
    out.z = source.z * -1;
    out.w = source.w * -1;
  }

  /**
   * Converts a Vector4 object to a unit vector by dividing the first three elements
   * (x, y, z) by the length of the vector.
   *
   * Returns the original length.
   **/
  static normalize(target: Vector4Like): number {
    const l = this.length(target);

    if (l !== 0) {
      target.x /= l;
      target.y /= l;
      target.z /= l;
      target.w /= l;
    }

    return l;
  }

  static normalizeTo(out: Vector4Like, source: Vector4Like): number {
    const l = this.length(source);

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
  static projectToVec3(out: Vector3Like, source: Vector4Like): void {
    out.x = source.x / source.w;
    out.y = source.y / source.w;
    out.z = source.z / source.w;
  }

  /**
   * Scales the current Vector4 object by a scalar, a magnitude. The Vector4 object's
   * x, y, and z elements are multiplied by the provided scalar number.
   *
   * The w component is ignored.
   **/
  static scaleBy(target: Vector4Like, scalar: number): void {
    target.x *= scalar;
    target.y *= scalar;
    target.z *= scalar;
    target.w *= scalar;
  }

  static scaleTo(out: Vector4Like, source: Vector4Like, scalar: number): void {
    out.x = source.x * scalar;
    out.y = source.y * scalar;
    out.z = source.z * scalar;
    out.w = source.w * scalar;
  }

  /**
   * Sets the members of Vector4 to the specified values
   *
   * If you do not pass a w value, the w component will be ignored.
   **/
  static setTo(out: Vector4Like, x: number, y: number, z: number, w: number): void {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
  }

  /**
   * Subtracts the value of the x, y, and z elements of the current Vector4 object
   * from the values of the x, y, and z elements of another Vector4 object.
   *
   * The w component is ignored.
   **/
  static subtract(source: Vector4Like, other: Vector4Like): Vector4 {
    const out = new Vector4();
    out.x = source.x - other.x;
    out.y = source.y - other.y;
    out.z = source.z - other.z;
    out.w = source.w - other.w;
    return out;
  }

  static subtractTo(out: Vector4Like, source: Vector4Like, other: Vector4Like): void {
    out.x = source.x - other.x;
    out.y = source.y - other.y;
    out.z = source.z - other.z;
    out.w = source.w - other.w;
  }

  // Get & Set Methods

  static get X_AXIS(): Vector4 {
    return new Vector4(1, 0, 0, 0);
  }

  static get Y_AXIS(): Vector4 {
    return new Vector4(0, 1, 0, 0);
  }

  static get Z_AXIS(): Vector4 {
    return new Vector4(0, 0, 1, 0);
  }

  static get W_AXIS(): Vector4 {
    return new Vector4(0, 0, 0, 1);
  }

  get length(): number {
    return Vector4.length(this);
  }

  get lengthSquared(): number {
    return Vector4.lengthSquared(this);
  }
}
