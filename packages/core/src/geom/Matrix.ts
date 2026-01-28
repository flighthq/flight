import Point from './Point.js';
import Rectangle from './Rectangle.js';
import type Vector3D from './Vector3D.js';

/**
 * A Matrix object represents a two-dimensional coordinate space.
 *
 * You can translate, scale, rotate, and skew two-dimensional objects
 * by modifying and applying a Matrix object to a Transform object.
 *
 * @see Point
 * @see Vector3D
 * @see Transform
 * @see Rectangle
 */
export default class Matrix {
  a: number = 1;
  b: number = 0;
  c: number = 0;
  d: number = 1;
  tx: number = 0;
  ty: number = 0;

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    if (a !== undefined) this.a = a;
    if (b !== undefined) this.b = b;
    if (c !== undefined) this.c = c;
    if (d !== undefined) this.d = d;
    if (tx !== undefined) this.tx = tx;
    if (ty !== undefined) this.ty = ty;
  }

  static clone(source: Matrix): Matrix {
    const m = new Matrix();
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
  static concat(target: Matrix, source: Matrix): void {
    return this.multiply(target, source, target);
  }

  static copyColumnFrom(target: Matrix, column: number, source: Vector3D): void {
    if (column > 2) {
      throw 'Column ' + column + ' out of bounds (2)';
    } else if (column === 0) {
      target.a = source.x;
      target.b = source.y;
    } else if (column === 1) {
      target.c = source.x;
      target.d = source.y;
    } else {
      target.tx = source.x;
      target.ty = source.y;
    }
  }

  static copyColumnTo(source: Matrix, column: number, target: Vector3D): void {
    if (column > 2) {
      throw 'Column ' + column + ' out of bounds (2)';
    } else if (column === 0) {
      target.x = source.a;
      target.y = source.b;
      target.z = 0;
    } else if (column === 1) {
      target.x = source.c;
      target.y = source.d;
      target.z = 0;
    } else {
      target.x = source.tx;
      target.y = source.ty;
      target.z = 1;
    }
  }

  static copyFrom(target: Matrix, source: Matrix): void {
    target.a = source.a;
    target.b = source.b;
    target.c = source.c;
    target.d = source.d;
    target.tx = source.tx;
    target.ty = source.ty;
  }

  static copyRowFrom(target: Matrix, row: number, source: Vector3D): void {
    if (row > 2) {
      throw 'Row ' + row + ' out of bounds (2)';
    } else if (row === 0) {
      target.a = source.x;
      target.c = source.y;
      target.tx = source.z;
    } else if (row === 1) {
      target.b = source.x;
      target.d = source.y;
      target.ty = source.z;
    }
  }

  static copyRowTo(target: Matrix, row: number, source: Vector3D): void {
    if (row > 2) {
      throw 'Row ' + row + ' out of bounds (2)';
    } else if (row === 0) {
      source.x = target.a;
      source.y = target.c;
      source.z = target.tx;
    } else if (row === 1) {
      source.x = target.b;
      source.y = target.d;
      source.z = target.ty;
    } else {
      source.x = 0;
      source.y = 0;
      source.z = 1;
    }
  }

  /**
   * Using `createBox()` lets you obtain the same matrix as
   * if you applied `identity()`, `rotate()`, `scale()`, and
   * `translate()` in succession.
   **/
  static createBox(
    target: Matrix,
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

      target.a = cos * scaleX;
      target.b = sin * scaleY;
      target.c = -sin * scaleX;
      target.d = cos * scaleY;
    } else {
      target.a = scaleX;
      target.b = 0;
      target.c = 0;
      target.d = scaleY;
    }

    target.tx = tx;
    target.ty = ty;
  }

  /**
   * Creates the specific style of matrix expected by the
   * `beginGradientFill()` and `lineGradientStyle()` methods of the
   * Graphics class. Width and height are scaled to a `scaleX`/`scaleY`
   * pair and the `tx`/`ty` values are offset by half the width and height.
   **/
  static createGradientBox(
    target: Matrix,
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): void {
    target.a = width / 1638.4;
    target.d = height / 1638.4;

    // rotation is clockwise
    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      target.b = sin * target.d;
      target.c = -sin * target.a;
      target.a *= cos;
      target.d *= cos;
    } else {
      target.b = 0;
      target.c = 0;
    }

    target.tx = tx + width / 2;
    target.ty = ty + height / 2;
  }

  /**
   * Given a point in the pretransform coordinate space, returns the
   * coordinates of that point after the transformation occurs. Unlike the
   * standard transformation applied using the `transformPoint()`
   * method, the `deltaTransformPoint()` method's transformation
   * does not consider the translation parameters `tx` and
   * `ty`.
   *
   * If you do not provide a targetPoint, a new Point() will be created
   **/
  static deltaTransformPoint(sourceMatrix: Matrix, sourcePoint: Point, targetPoint?: Point): Point {
    targetPoint = targetPoint ?? new Point();
    this.deltaTransformXY(sourceMatrix, sourcePoint.x, sourcePoint.y, targetPoint);
    return targetPoint;
  }

  static deltaTransformXY(source: Matrix, x: number, y: number, out: Point): void {
    out.x = x * source.a + y * source.c;
    out.y = x * source.b + y * source.d;
  }

  static equals(
    source: Matrix | null | undefined,
    other: Matrix | null | undefined,
    includeTranslation: boolean = true,
  ): boolean {
    if (source === other) return true;
    if (!source || !other) return false;
    return (
      (!includeTranslation || (source.tx === other.tx && source.ty === other.ty)) &&
      source.a === other.a &&
      source.b === other.b &&
      source.c === other.c &&
      source.d === other.d
    );
  }

  /**
   * Sets each matrix property to a value that causes a null
   * transformation. An object transformed by applying an identity matrix
   * will be identical to the original.
   * After calling the `identity()` method, the resulting matrix has the
   * following properties: `a`=1, `b`=0, `c`=0, `d`=1, `tx`=0, `ty`=0.
   **/
  static identity(target: Matrix): void {
    target.a = 1;
    target.b = 0;
    target.c = 0;
    target.d = 1;
    target.tx = 0;
    target.ty = 0;
  }

  /**
   * Use an inverse of the source matrix to transform
   * a given point.
   *
   * If you do not provide a targetPoint, a new Point() will be created
   */
  static inverseTransformPoint(sourceMatrix: Matrix, sourcePoint: Point, targetPoint?: Point): Point {
    targetPoint = targetPoint ?? new Point();
    this.inverseTransformXY(sourceMatrix, sourcePoint.x, sourcePoint.y, targetPoint);
    return targetPoint;
  }

  static inverseTransformXY(source: Matrix, x: number, y: number, out: Point): void {
    const norm = source.a * source.d - source.b * source.c;
    if (norm === 0) {
      out.x = -source.tx;
      out.y = -source.ty;
    } else {
      const px = (1.0 / norm) * (source.c * (source.ty - y) + source.d * (x - source.tx));
      out.y = (1.0 / norm) * (source.a * (y - source.ty) + source.b * (source.tx - x));
      out.x = px;
    }
  }

  /**
   * Computes the inverse of a 2D affine matrix and writes it to out.
   *
   * Translation (tx, ty) is applied after the linear transformation (scale/rotation/shear) is inverted.
   */
  static inverse(source: Matrix, out: Matrix): void {
    const det = source.a * source.d - source.b * source.c;
    if (det === 0) {
      out.a = out.b = out.c = out.d = 0;
      out.tx = -source.tx;
      out.ty = -source.ty;
    } else {
      const invDet = 1.0 / det;
      const a1 = source.d * invDet;
      out.d = source.a * invDet;
      out.a = a1;
      out.b = -source.b * invDet;
      out.c = -source.c * invDet;

      const tx1 = -out.a * source.tx - out.c * source.ty;
      out.ty = -out.b * source.tx - out.d * source.ty;
      out.tx = tx1;
    }
  }

  /**
   * Performs the opposite transformation of the original matrix. You can apply
   * an inverted matrix to an object to undo the transformation performed when
   * applying the original matrix.
   **/
  static invert(source: Matrix): Matrix {
    Matrix.inverse(source, source);
    return source;
  }

  /**
   * Multiplies a by b and writes the result to out
   *
   * out = a * b
   */
  static multiply(a: Matrix, b: Matrix, out: Matrix): void {
    const a1 = a.a * b.a + a.b * b.c;
    out.b = a.a * b.b + a.b * b.d;
    out.a = a1;

    const c1 = a.c * b.a + a.d * b.c;
    out.d = a.c * b.b + a.d * b.d;
    out.c = c1;

    const tx1 = a.tx * b.a + a.ty * b.c + b.tx;
    out.ty = a.tx * b.b + a.ty * b.d + b.ty;
    out.tx = tx1;
  }

  /**
   * Applies a rotation transformation in-place to the Matrix object.
   * The `rotate()` method alters the `a`, `b`, `c`, and `d` properties of
   * the Matrix object.
   **/
  static rotate(target: Matrix, theta: number): void {
    this.rotateTo(target, theta, target);
  }

  /**
   * Applies a rotation transformation to the given Matrix object
   * and writes the result to out.
   **/
  static rotateTo(source: Matrix, theta: number, out: Matrix): void {
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

    var a1 = source.a * cos - source.b * sin;
    out.b = source.a * sin + source.b * cos;
    out.a = a1;

    var c1 = source.c * cos - source.d * sin;
    out.d = source.c * sin + source.d * cos;
    out.c = c1;

    var tx1 = source.tx * cos - source.ty * sin;
    out.ty = source.tx * sin + source.ty * cos;
    out.tx = tx1;
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   *
   * The `scale()` method alters the `a` and `d` properties of the Matrix
   * object.
   **/
  static scale(target: Matrix, sx: number, sy: number): void {
    this.scaleXY(target, sx, sy, target);
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   **/
  static scaleXY(source: Matrix, sx: number, sy: number, out: Matrix): void {
    /*
      Scale object "after" other transforms

      [  a  b   0 ][  sx  0   0 ]
      [  c  d   0 ][  0   sy  0 ]
      [  tx ty  1 ][  0   0   1 ]
    **/
    out.a = source.a * sx;
    out.b = source.b * sy;
    out.c = source.c * sx;
    out.d = source.d * sy;
    out.tx = source.tx * sx;
    out.ty = source.ty * sy;
  }

  static setTo(target: Matrix, a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    target.a = a;
    target.b = b;
    target.c = c;
    target.d = d;
    target.tx = tx;
    target.ty = ty;
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.tx}, ${this.ty})`;
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
  static transformAABB(source: Matrix, ax: number, ay: number, bx: number, by: number, out: Rectangle): void {
    const { a, b, c, d } = source;

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

    out.x = tx0 + source.tx;
    out.y = ty0 + source.ty;
    out.width = tx1 - tx0;
    out.height = ty1 - ty0;
  }

  /**
   * Transforms a point using the given matrix.
   *
   * If you do not provide a targetPoint, a new Point() will be created
   */
  static transformPoint(sourceMatrix: Matrix, sourcePoint: Point, targetPoint?: Point): Point {
    targetPoint = targetPoint ?? new Point();
    this.transformXY(sourceMatrix, sourcePoint.x, sourcePoint.y, targetPoint);
    return targetPoint;
  }

  /**
   * Applies a 2D affine transform to a given rectangle and updates it
   * to the axis-aligned bounding box of the transformed rectangle.
   *
   * This accounts for translation, rotation, scaling, and skew
   * from the given matrix.
   *
   * If you do not provide a targetRect, a new Rectangle() will be created
   **/
  static transformRect(sourceMatrix: Matrix, sourceRect: Rectangle, targetRect?: Rectangle): Rectangle {
    targetRect = targetRect ?? new Rectangle();
    this.transformAABB(sourceMatrix, sourceRect.x, sourceRect.y, sourceRect.right, sourceRect.bottom, targetRect);
    return targetRect;
  }

  /**
   * Transforms an (x, y) point using the given matrix.
   */
  static transformXY(source: Matrix, x: number, y: number, out: Point): void {
    out.x = x * source.a + y * source.c + source.tx;
    out.y = x * source.b + y * source.d + source.ty;
  }

  /**
   * Translates the matrix along the _x_ and _y_ axes, as specified
   * by the `dx` and `dy` parameters.
   **/
  static translate(target: Matrix, dx: number, dy: number): void {
    target.tx += dx;
    target.ty += dy;
  }
}
