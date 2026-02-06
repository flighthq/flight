import type {
  Matrix3 as Matrix3Like,
  Rectangle as RectangleLike,
  Vector2 as Vector2Like,
  Vector3 as Vector3Like,
} from '@flighthq/types';

import Matrix3 from './Matrix3.js';
import Rectangle from './Rectangle.js';
import Vector2 from './Vector2.js';

/**
 * An Affine2D object represents two-dimensional coordinate space.
 * It is a 2x3 matrix, with a, b, c, d for a two-dimensional transform,
 * and tx, ty for translation.
 *
 * @see Vector2
 * @see Vector3
 * @see Transform
 * @see Rectangle
 */
export default class Affine2D implements Matrix3Like {
  private static __identity: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  readonly m: Float32Array = new Float32Array(Affine2D.__identity);

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    if (a !== undefined) this.m[0] = a;
    if (b !== undefined) this.m[1] = b;
    if (c !== undefined) this.m[3] = c;
    if (d !== undefined) this.m[4] = d;
    if (tx !== undefined) this.m[2] = tx;
    if (ty !== undefined) this.m[5] = ty;
  }

  static clone(source: Matrix3Like): Affine2D {
    const m = new Affine2D();
    this.copyFrom(m, source);
    return m;
  }

  /**
   * Multiplies target by source, applying the result to target
   *
   * target *= source
   *
   * @see multiply
   */
  static concat(target: Matrix3Like, source: Matrix3Like): void {
    return this.multiply(target, target, source);
  }

  static copyColumnFrom(out: Matrix3Like, column: number, source: Vector3Like): void {
    if (column > 2) {
      throw new RangeError('Column ' + column + ' out of bounds (2)');
    } else if (column === 0) {
      out.m[0] = source.x;
      out.m[1] = source.y;
    } else if (column === 1) {
      out.m[3] = source.x;
      out.m[4] = source.y;
    } else {
      out.m[2] = source.x;
      out.m[5] = source.y;
    }
  }

  static copyColumnTo(out: Vector3Like, column: number, source: Matrix3Like): void {
    if (column > 2) {
      throw new RangeError('Column ' + column + ' out of bounds (2)');
    } else if (column === 0) {
      out.x = source.m[0];
      out.y = source.m[1];
      out.z = 0;
    } else if (column === 1) {
      out.x = source.m[3];
      out.y = source.m[4];
      out.z = 0;
    } else {
      out.x = source.m[2];
      out.y = source.m[5];
      out.z = 1;
    }
  }

  static copyFrom(out: Matrix3Like, source: Matrix3Like): void {
    out.m[0] = source.m[0];
    out.m[1] = source.m[1];
    out.m[3] = source.m[3];
    out.m[4] = source.m[4];
    out.m[2] = source.m[2];
    out.m[5] = source.m[5];
  }

  static copyRowFrom(out: Matrix3Like, row: number, source: Vector3Like): void {
    if (row > 2) {
      throw new RangeError('Row ' + row + ' out of bounds (2)');
    } else if (row === 0) {
      out.m[0] = source.x;
      out.m[3] = source.y;
      out.m[2] = source.z;
    } else if (row === 1) {
      out.m[1] = source.x;
      out.m[4] = source.y;
      out.m[5] = source.z;
    }
  }

  static copyRowTo(out: Vector3Like, row: number, source: Matrix3Like): void {
    if (row > 2) {
      throw new RangeError('Row ' + row + ' out of bounds (2)');
    } else if (row === 0) {
      out.x = source.m[0];
      out.y = source.m[3];
      out.z = source.m[2];
    } else if (row === 1) {
      out.x = source.m[1];
      out.y = source.m[4];
      out.z = source.m[5];
    } else {
      out.x = 0;
      out.y = 0;
      out.z = 1;
    }
  }

  /**
   * Using `createBox()` lets you obtain the same matrix as
   * if you applied `identity()`, `rotate()`, `scale()`, and
   * `translate()` in succession.
   **/
  static createBox(
    out: Matrix3Like,
    scaleX: number,
    scaleY: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): void {
    // identity ();
    // rotate (rotation);
    // scale (scaleX, scaleY);
    // translate (tx, ty);

    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      out.m[0] = cos * scaleX;
      out.m[1] = sin * scaleY;
      out.m[3] = -sin * scaleX;
      out.m[4] = cos * scaleY;
    } else {
      out.m[0] = scaleX;
      out.m[1] = 0;
      out.m[3] = 0;
      out.m[4] = scaleY;
    }

    out.m[2] = tx;
    out.m[5] = ty;
  }

  /**
   * Creates the specific style of matrix expected by the
   * `beginGradientFill()` and `lineGradientStyle()` methods of the
   * Graphics class. Width and height are scaled to a `scaleX`/`scaleY`
   * pair and the `tx`/`ty` values are offset by half the width and height.
   **/
  static createGradientBox(
    out: Matrix3Like,
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): void {
    out.m[0] = width / 1638.4;
    out.m[4] = height / 1638.4;

    // rotation is clockwise
    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      out.m[1] = sin * out.m[4];
      out.m[3] = -sin * out.m[0];
      out.m[0] *= cos;
      out.m[4] *= cos;
    } else {
      out.m[1] = 0;
      out.m[3] = 0;
    }

    out.m[2] = tx + width / 2;
    out.m[5] = ty + height / 2;
  }

  static equals(
    source: Matrix3Like | null | undefined,
    other: Matrix3Like | null | undefined,
    includeTranslation: boolean = true,
  ): boolean {
    if (source === other) return true;
    if (!source || !other) return false;
    return (
      (!includeTranslation || (source.m[2] === other.m[2] && source.m[5] === other.m[5])) &&
      source.m[0] === other.m[0] &&
      source.m[1] === other.m[1] &&
      source.m[3] === other.m[3] &&
      source.m[4] === other.m[4]
    );
  }

  static fromMatrix3(source: Matrix3): Affine2D {
    return new Affine2D(source.m00, source.m01, source.m10, source.m11, source.m02, source.m12);
  }

  /**
   * Sets each matrix property to a value that causes a null
   * transformation. An object transformed by applying an identity matrix
   * will be identical to the original.
   * After calling the `identity()` method, the resulting matrix has the
   * following properties: `a`=1, `b`=0, `c`=0, `d`=1, `tx`=0, `ty`=0.
   **/
  static identity(out: Matrix3Like): void {
    out.m[0] = 1;
    out.m[1] = 0;
    out.m[3] = 0;
    out.m[4] = 1;
    out.m[2] = 0;
    out.m[5] = 0;
  }

  /**
   * Computes the inverse of a 2D affine matrix and writes it to out.
   *
   * Translation (tx, ty) is applied after the linear transformation (scale/rotation/shear) is inverted.
   */
  static inverse(out: Matrix3Like, source: Matrix3Like): void {
    const det = source.m[0] * source.m[4] - source.m[1] * source.m[3];
    if (det === 0) {
      out.m[0] = out.m[1] = out.m[3] = out.m[4] = 0;
      out.m[2] = -source.m[2];
      out.m[5] = -source.m[5];
    } else {
      const invDet = 1.0 / det;
      const a1 = source.m[4] * invDet;
      out.m[4] = source.m[0] * invDet;
      out.m[0] = a1;
      out.m[1] = -source.m[1] * invDet;
      out.m[3] = -source.m[3] * invDet;

      const tx1 = -out.m[0] * source.m[2] - out.m[3] * source.m[5];
      out.m[5] = -out.m[1] * source.m[2] - out.m[4] * source.m[5];
      out.m[2] = tx1;
    }
  }

  /**
   * Use an inverse of the source matrix to transform
   * a given point, including translation.
   *
   * Returns a new Vector2() with the result.
   * @see inverseTransformPointXY
   */
  static inverseTransformPoint(matrix: Matrix3Like, point: Vector2Like): Vector2 {
    const out = new Vector2();
    this.inverseTransformPointXY(out, matrix, point.x, point.y);
    return out;
  }

  static inverseTransformPointXY(out: Vector2Like, source: Matrix3Like, x: number, y: number): void {
    const norm = source.m[0] * source.m[4] - source.m[1] * source.m[3];
    if (norm === 0) {
      out.x = -source.m[2];
      out.y = -source.m[5];
    } else {
      const px = (1.0 / norm) * (source.m[3] * (source.m[5] - y) + source.m[4] * (x - source.m[2]));
      out.y = (1.0 / norm) * (source.m[0] * (y - source.m[5]) + source.m[1] * (source.m[2] - x));
      out.x = px;
    }
  }

  /**
   * Use an inverse of the source matrix to transform
   * a given point, excluding translation.
   *
   * Returns a new Vector2() with the result.
   * @see inverseTransformPointXY
   */
  static inverseTransformVector(matrix: Matrix3Like, vector: Vector2Like): Vector2 {
    const out = new Vector2();
    this.inverseTransformVectorXY(out, matrix, vector.x, vector.y);
    return out;
  }

  static inverseTransformVectorXY(out: Vector2Like, source: Matrix3Like, x: number, y: number): void {
    const norm = source.m[0] * source.m[4] - source.m[1] * source.m[3];
    if (norm === 0) {
      out.x = 0;
      out.y = 0;
    } else {
      const px = (1.0 / norm) * (source.m[4] * x - source.m[3] * y);
      out.y = (1.0 / norm) * (-source.m[1] * x + source.m[0] * y);
      out.x = px;
    }
  }

  /**
   * Performs the opposite transformation of the original matrix. You can apply
   * an inverted matrix to an object to undo the transformation performed when
   * applying the original matrix.
   **/
  static invert(target: Matrix3Like): Matrix3Like {
    this.inverse(target, target);
    return target;
  }

  /**
   * Multiplies a by b and writes the result to out
   *
   * out = a * b
   */
  static multiply(out: Matrix3Like, a: Matrix3Like, b: Matrix3Like): void {
    const a1 = a.m[0] * b.m[0] + a.m[1] * b.m[3];
    out.m[1] = a.m[0] * b.m[1] + a.m[1] * b.m[4];
    out.m[0] = a1;

    const c1 = a.m[3] * b.m[0] + a.m[4] * b.m[3];
    out.m[4] = a.m[3] * b.m[1] + a.m[4] * b.m[4];
    out.m[3] = c1;

    const tx1 = a.m[2] * b.m[0] + a.m[5] * b.m[3] + b.m[2];
    out.m[5] = a.m[2] * b.m[1] + a.m[5] * b.m[4] + b.m[5];
    out.m[2] = tx1;
  }

  /**
   * Applies a rotation transformation in-place to the Affine2D object.
   * The `rotate()` method alters the `a`, `b`, `c`, and `d` properties of
   * the Affine2D object.
   * @see rotateTo
   **/
  static rotate(target: Matrix3Like, theta: number): void {
    this.rotateTo(target, target, theta);
  }

  /**
   * Applies a rotation transformation to the given Affine2D object
   * and writes the result to out.
   **/
  static rotateTo(out: Matrix3Like, source: Matrix3Like, theta: number): void {
    /**
      Rotate object "after" other transforms

      [  a  b   0 ][  ma mb  0 ]
      [  c  d   0 ][  mc md  0 ]
      [  tx ty  1 ][  mtx mty 1 ]

      ma = md = cos
      mb = sin
      mc = -sin
      mtx = my = 0
    **/
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    var a1 = source.m[0] * cos - source.m[1] * sin;
    out.m[1] = source.m[0] * sin + source.m[1] * cos;
    out.m[0] = a1;

    var c1 = source.m[3] * cos - source.m[4] * sin;
    out.m[4] = source.m[3] * sin + source.m[4] * cos;
    out.m[3] = c1;

    var tx1 = source.m[2] * cos - source.m[5] * sin;
    out.m[5] = source.m[2] * sin + source.m[5] * cos;
    out.m[2] = tx1;
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   *
   * The `scale()` method alters the `a` and `d` properties of the Affine2D
   * object.
   * @see scaleXY
   **/
  static scale(target: Matrix3Like, sx: number, sy: number): void {
    this.scaleXY(target, target, sx, sy);
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   **/
  static scaleXY(out: Matrix3Like, source: Matrix3Like, sx: number, sy: number): void {
    /*
      Scale object "after" other transforms

      [  a  b   0 ][  sx  0   0 ]
      [  c  d   0 ][  0   sy  0 ]
      [  tx ty  1 ][  0   0   1 ]
    **/
    out.m[0] = source.m[0] * sx;
    out.m[1] = source.m[1] * sy;
    out.m[3] = source.m[3] * sx;
    out.m[4] = source.m[4] * sy;
    out.m[2] = source.m[2] * sx;
    out.m[5] = source.m[5] * sy;
  }

  static setTo(out: Matrix3Like, a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    out.m[0] = a;
    out.m[1] = b;
    out.m[3] = c;
    out.m[4] = d;
    out.m[2] = tx;
    out.m[5] = ty;
  }

  static toMatrix3(source: Affine2D): Matrix3 {
    return new Matrix3(source.m[0], source.m[1], source.m[2], source.m[3], source.m[4], source.m[5], 0, 0, 1);
  }

  /**
   * Transforms an axis-aligned bounding box defined by two opposite corners
   * (ax, ay) and (bx, by) into a world-space axis-aligned bounding box.
   *
   * The input points may be in any order (min/max not required).
   *
   * This accounts for translation, rotation, scaling, and skew
   * from the source matrix.
   **/
  static transformAABB(out: RectangleLike, source: Matrix3Like, ax: number, ay: number, bx: number, by: number): void {
    const a = source.m[0];
    const b = source.m[1];
    const c = source.m[3];
    const d = source.m[4];

    let tx0 = a * ax + c * ay;
    let tx1 = tx0;
    let ty0 = b * ax + d * ay;
    let ty1 = ty0;

    let tx = a * bx + c * ay;
    let ty = b * bx + d * ay;

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    tx = a * bx + c * by;
    ty = b * bx + d * by;

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    tx = a * ax + c * by;
    ty = b * ax + d * by;

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    out.x = tx0 + source.m[2];
    out.y = ty0 + source.m[5];
    out.width = tx1 - tx0;
    out.height = ty1 - ty0;
  }

  /**
   * Transforms a point using the given matrix.
   *
   * Returns a new Vector2() with the result.
   * @see transformPointXY
   */
  static transformPoint(matrix: Matrix3Like, point: Vector2Like): Vector2 {
    const out = new Vector2();
    this.transformPointXY(out, matrix, point.x, point.y);
    return out;
  }

  /**
   * Transforms an (x, y) point using the given matrix.
   */
  static transformPointXY(out: Vector2Like, source: Matrix3Like, x: number, y: number): void {
    out.x = x * source.m[0] + y * source.m[3] + source.m[2];
    out.y = x * source.m[1] + y * source.m[4] + source.m[5];
  }

  /**
   * Applies a point transform to each corner of a rectangle and updates it
   * to the axis-aligned bounding box of the transformed rectangle.
   *
   * This accounts for translation, rotation, scaling, and skew
   * from the given matrix.
   *
   * Returns a new Rectangle() with the result.
   * @see transformRectTo
   * @see transformAABB
   **/
  static transformRect(matrix: Matrix3Like, rect: RectangleLike): Rectangle {
    const out = new Rectangle();
    this.transformRectTo(out, matrix, rect);
    return out;
  }

  /**
   * Applies a point transform to each corner of a rectangle and updates it
   * to the axis-aligned bounding box of the transformed rectangle.
   *
   * This accounts for translation, rotation, scaling, and skew
   * from the given matrix.
   *
   * @see transformAABB
   */
  static transformRectTo(out: RectangleLike, matrix: Matrix3Like, source: RectangleLike): void {
    this.transformAABB(out, matrix, source.x, source.y, source.x + source.width, source.y + source.height);
  }

  /**
   * Given a point in the pretransform coordinate space, returns the
   * coordinates of that point after the transformation occurs. Unlike the
   * standard transformation applied using the `transformPoint()`
   * method, the `transformVector()` method's transformation
   * does not consider the translation parameters `tx` and
   * `ty`.
   *
   * Returns a new Vector2() with the result.
   * @see transformVectorXY
   **/
  static transformVector(matrix: Matrix3Like, vector: Vector2Like): Vector2 {
    const out = new Vector2();
    this.transformVectorXY(out, matrix, vector.x, vector.y);
    return out;
  }

  static transformVectorXY(out: Vector2Like, source: Matrix3Like, x: number, y: number): void {
    out.x = x * source.m[0] + y * source.m[3];
    out.y = x * source.m[1] + y * source.m[4];
  }

  /**
   * Translates the matrix along the _x_ and _y_ axes, as specified
   * by the `dx` and `dy` parameters.
   **/
  static translate(out: Matrix3Like, dx: number, dy: number): void {
    out.m[2] += dx;
    out.m[5] += dy;
  }

  // Get & Set Methods

  get a(): number {
    return this.m[0];
  }

  set a(value: number) {
    this.m[0] = value;
  }

  get b(): number {
    return this.m[1];
  }

  set b(value: number) {
    this.m[1] = value;
  }

  get c(): number {
    return this.m[3];
  }

  set c(value: number) {
    this.m[3] = value;
  }

  get d(): number {
    return this.m[4];
  }

  set d(value: number) {
    this.m[4] = value;
  }

  get tx(): number {
    return this.m[2];
  }

  set tx(value: number) {
    this.m[2] = value;
  }

  get ty(): number {
    return this.m[5];
  }

  set ty(value: number) {
    this.m[5] = value;
  }
}
