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
    return new Matrix(source.a, source.b, source.c, source.d, source.tx, source.ty);
  }

  static concat(target: Matrix, source: Matrix): void {
    const a1 = target.a * source.a + target.b * source.c;
    target.b = target.a * source.b + target.b * source.d;
    target.a = a1;

    const c1 = target.c * source.a + target.d * source.c;
    target.d = target.c * source.b + target.d * source.d;
    target.c = c1;

    const tx1 = target.tx * source.a + target.ty * source.c + source.tx;
    target.ty = target.tx * source.b + target.ty * source.d + source.ty;
    target.tx = tx1;
  }

  static copyColumnFrom(target: Matrix, column: number, source: Vector3D): void {
    if (column > 2) {
      throw 'Column ' + column + ' out of bounds (2)';
    } else if (column == 0) {
      target.a = source.x;
      target.b = source.y;
    } else if (column == 1) {
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
    } else if (column == 0) {
      target.x = source.a;
      target.y = source.b;
      target.z = 0;
    } else if (column == 1) {
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
    } else if (row == 0) {
      target.a = source.x;
      target.c = source.y;
      target.tx = source.z;
    } else if (row == 1) {
      target.b = source.x;
      target.d = source.y;
      target.ty = source.z;
    }
  }

  static copyRowTo(target: Matrix, row: number, source: Vector3D): void {
    if (row > 2) {
      throw 'Row ' + row + ' out of bounds (2)';
    } else if (row == 0) {
      source.x = target.a;
      source.y = target.c;
      source.z = target.tx;
    } else if (row == 1) {
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

    if (rotation != 0) {
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
    if (rotation != 0) {
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
    targetPoint.x = sourcePoint.x * sourceMatrix.a + sourcePoint.y * sourceMatrix.c;
    targetPoint.y = sourcePoint.x * sourceMatrix.b + sourcePoint.y * sourceMatrix.d;
    return targetPoint;
  }

  static equals(
    source: Matrix | null | undefined,
    other: Matrix | null | undefined,
    includeTranslation: boolean = true,
  ): boolean {
    if (source == other) return true;
    if (!source || !other) return false;
    return (
      (!includeTranslation || (source.tx == other.tx && source.ty == other.ty)) &&
      source.a == other.a &&
      source.b == other.b &&
      source.c == other.c &&
      source.d == other.d
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
    const norm = sourceMatrix.a * sourceMatrix.d - sourceMatrix.b * sourceMatrix.c;

    if (norm == 0) {
      targetPoint.x = -sourceMatrix.tx;
      targetPoint.y = -sourceMatrix.ty;
    } else {
      const px =
        (1.0 / norm) *
        (sourceMatrix.c * (sourceMatrix.ty - sourcePoint.y) + sourceMatrix.d * (sourcePoint.x - sourceMatrix.tx));
      targetPoint.y =
        (1.0 / norm) *
        (sourceMatrix.a * (sourcePoint.y - sourceMatrix.ty) + sourceMatrix.b * (sourceMatrix.tx - sourcePoint.x));
      targetPoint.x = px;
    }

    return targetPoint;
  }

  /**
   * Performs the opposite transformation of the original matrix. You can apply
   * an inverted matrix to an object to undo the transformation performed when
   * applying the original matrix.
   **/
  static invert(target: Matrix): Matrix {
    let norm = target.a * target.d - target.b * target.c;

    if (norm == 0) {
      target.a = target.b = target.c = target.d = 0;
      target.tx = -target.tx;
      target.ty = -target.ty;
    } else {
      norm = 1.0 / norm;
      const a1 = target.d * norm;
      target.d = target.a * norm;
      target.a = a1;
      target.b *= -norm;
      target.c *= -norm;

      const tx1 = -target.a * target.tx - target.c * target.ty;
      target.ty = -target.b * target.tx - target.d * target.ty;
      target.tx = tx1;
    }

    return target;
  }

  /**
   * Applies a rotation transformation to the Matrix object.
   * The `rotate()` method alters the `a`, `b`, `c`, and `d` properties of
   * the Matrix object.
   **/
  static rotate(target: Matrix, theta: number): void {
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

    const a1 = target.a * cos - target.b * sin;
    target.b = target.a * sin + target.b * cos;
    target.a = a1;

    const c1 = target.c * cos - target.d * sin;
    target.d = target.c * sin + target.d * cos;
    target.c = c1;

    const tx1 = target.tx * cos - target.ty * sin;
    target.ty = target.tx * sin + target.ty * cos;
    target.tx = tx1;
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   * The `scale()` method alters the `a` and `d` properties of the Matrix
   * object.
   **/
  static scale(target: Matrix, sx: number, sy: number): void {
    /*
    
            Scale object "after" other transforms
    
            [  a  b   0 ][  sx  0   0 ]
            [  c  d   0 ][  0   sy  0 ]
            [  tx ty  1 ][  0   0   1 ]
        **/

    target.a *= sx;
    target.b *= sy;
    target.c *= sx;
    target.d *= sy;
    target.tx *= sx;
    target.ty *= sy;
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
   * Transforms a point using the given matrix.
   *
   * If you do not provide a targetPoint, a new Point() will be created
   */
  static transformPoint(sourceMatrix: Matrix, sourcePoint: Point, targetPoint?: Point): Point {
    targetPoint = targetPoint ?? new Point();
    targetPoint.x = sourcePoint.x * sourceMatrix.a + sourcePoint.y * sourceMatrix.c + sourceMatrix.tx;
    targetPoint.y = sourcePoint.x * sourceMatrix.b + sourcePoint.y * sourceMatrix.d + sourceMatrix.ty;
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

    const { a, b, c, d } = sourceMatrix;
    const { x, y, width, height } = sourceRect;

    let tx0 = a * x + c * y;
    let tx1 = tx0;
    let ty0 = b * x + d * y;
    let ty1 = ty0;

    let tx = a * (x + width) + c * y;
    let ty = b * (x + width) + d * y;

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    tx = a * (x + width) + c * (y + height);
    ty = b * (x + width) + d * (y + height);

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    tx = a * x + c * (y + height);
    ty = b * x + d * (y + height);

    if (tx < tx0) tx0 = tx;
    if (ty < ty0) ty0 = ty;
    if (tx > tx1) tx1 = tx;
    if (ty > ty1) ty1 = ty;

    targetRect.x = tx0 + sourceMatrix.tx;
    targetRect.y = ty0 + sourceMatrix.ty;
    targetRect.width = tx1 - tx0;
    targetRect.height = ty1 - ty0;

    return targetRect;
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
