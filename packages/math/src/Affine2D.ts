import type {
  Affine2D as Affine2DLike,
  Matrix3 as Matrix3Like,
  Matrix4 as Matrix4Like,
  Rectangle as RectangleLike,
  Vector2 as Vector2Like,
  Vector3 as Vector3Like,
} from '@flighthq/types';

/**
 * An Affine2D object represents two-dimensional coordinate space.
 * It is a 2x3 matrix, with a, b, c, d for a two-dimensional transform,
 * and tx, ty for translation.
 *
 * [ a b tx ]
 * [ c d ty ]
 *
 * Storage is row-major.
 *
 * @see Vector2
 * @see Vector3
 * @see Transform
 * @see Rectangle
 */
export default class Affine2D {
  private static __identity: Float32Array = new Float32Array([1, 0, 0, 0, 1, 0]);

  readonly m: Float32Array = new Float32Array(Affine2D.__identity);

  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    if (a !== undefined) this.m[0] = a;
    if (b !== undefined) this.m[1] = b;
    if (c !== undefined) this.m[3] = c;
    if (d !== undefined) this.m[4] = d;
    if (tx !== undefined) this.m[2] = tx;
    if (ty !== undefined) this.m[5] = ty;
  }

  static clone(source: Affine2DLike): Affine2D {
    const m = new Affine2D();
    this.copy(m, source);
    return m;
  }

  /**
   * Concatenates two affine 2D transforms:
   *
   *   out = a ∘ b
   *
   * Applies the transforms of matrix b onto (and after) matrix a.
   */
  static concat(out: Affine2DLike, a: Affine2DLike, b: Affine2DLike): void {
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

  static copy(out: Affine2DLike, source: Affine2DLike): void {
    out.m.set(source.m);
  }

  /**
   * Copies a column from a vector. The z component will be ignored (3x2 matrix).
   */
  static copyColumnFrom(out: Affine2DLike, column: number, source: Vector3Like): void {
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

  /**
   * Copies a column to a vector. The z component will use identity values.
   */
  static copyColumnTo(out: Vector3Like, column: number, source: Affine2DLike): void {
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

  copyFrom(source: Affine2DLike): Affine2D {
    this.m.set(source.m);
    return this;
  }

  /**
   * Copies a row from a vector. The third row (row 2) will be ignored (3x2 matrix).
   */
  static copyRowFrom(out: Affine2DLike, row: number, source: Vector3Like): void {
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

  /**
   * Copies a row to a vector. The third row will use identity values (3x2 matrix).
   */
  static copyRowTo(out: Vector3Like, row: number, source: Affine2DLike): void {
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

  static createGradientTransform(
    width: number,
    height: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Affine2D {
    const out = new Affine2D();
    this.setGradientTransform(out, width, height, rotation, tx, ty);
    return out;
  }

  static createTransform(
    scaleX: number,
    scaleY: number,
    rotation: number = 0,
    tx: number = 0,
    ty: number = 0,
  ): Affine2D {
    const out = new Affine2D();
    this.setTransform(out, scaleX, scaleY, rotation, tx, ty);
    return out;
  }

  static equals(
    a: Affine2DLike | null | undefined,
    b: Affine2DLike | null | undefined,
    compareTranslation: boolean = true,
  ): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      (!compareTranslation || (a.m[2] === b.m[2] && a.m[5] === b.m[5])) &&
      a.m[0] === b.m[0] &&
      a.m[1] === b.m[1] &&
      a.m[3] === b.m[3] &&
      a.m[4] === b.m[4]
    );
  }

  static fromMatrix3(out: Affine2DLike, source: Matrix3Like): void {
    out.m.set(source.m.slice(0, 6));
  }

  static fromMatrix4(out: Affine2DLike, source: Matrix4Like): void {
    const s = source.m;
    out.m[0] = s[0];
    out.m[1] = s[4];
    out.m[2] = s[12];
    out.m[3] = s[1];
    out.m[4] = s[5];
    out.m[5] = s[13];
  }

  /**
   * Sets each matrix property to a value that causes a null
   * transformation. An object transformed by applying an identity matrix
   * will be identical to the original.
   * After calling the `identity()` method, the resulting matrix has the
   * following properties: `a`=1, `b`=0, `c`=0, `d`=1, `tx`=0, `ty`=0.
   **/
  static identity(out: Affine2DLike): void {
    out.m.set(this.__identity);
  }

  identity(): Affine2D {
    this.m.set(Affine2D.__identity);
    return this;
  }

  /**
   * Computes the inverse of a 2D affine matrix and writes it to out.
   *
   * Translation (tx, ty) is applied after the linear transformation (scale/rotation/shear) is inverted.
   */
  static inverse(out: Affine2D, source: Affine2DLike): void {
    const _out = out.m;
    const _s = source.m;
    const det = _s[0] * _s[4] - _s[3] * _s[1];
    if (det === 0) {
      _out[0] = _out[1] = _out[3] = _out[4] = 0;
      _out[2] = -_s[2];
      _out[5] = -_s[5];
    } else {
      const invDet = 1 / det;
      _out[0] = _s[4] * invDet;
      _out[1] = -_s[1] * invDet;
      _out[3] = -_s[3] * invDet;
      _out[4] = _s[0] * invDet;
      _out[2] = -(_out[0] * _s[2] + _out[1] * _s[5]);
      _out[5] = -(_out[3] * _s[2] + _out[4] * _s[5]);
    }
  }

  /**
   * Use an inverse of the source matrix to transform
   * a given point, including translation.
   * @see inverseTransformPointXY
   */
  static inverseTransformPoint(out: Vector2Like, matrix: Affine2DLike, point: Vector2Like): void {
    this.inverseTransformPointXY(out, matrix, point.x, point.y);
  }

  static inverseTransformPointXY(out: Vector2Like, source: Affine2DLike, x: number, y: number): void {
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
   * @see inverseTransformPointXY
   */
  static inverseTransformVector(out: Vector2Like, matrix: Affine2DLike, vector: Vector2Like): void {
    this.inverseTransformVectorXY(out, matrix, vector.x, vector.y);
  }

  static inverseTransformVectorXY(out: Vector2Like, source: Affine2DLike, x: number, y: number): void {
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
   * Multiplies a by b and writes the result to out.
   *
   * out = a * b
   */
  static multiply(out: Affine2DLike, a: Affine2DLike, b: Affine2DLike): void {
    const _out = out.m;
    const _a = a.m;
    const _b = b.m;

    const a1 = _a[0],
      c1 = _a[1],
      tx1 = _a[2];
    const b1 = _a[3],
      d1 = _a[4],
      ty1 = _a[5];

    const a2 = _b[0],
      c2 = _b[1],
      tx2 = _b[2];
    const b2 = _b[3],
      d2 = _b[4],
      ty2 = _b[5];

    // Row-major multiplication
    _out[0] = a1 * a2 + c1 * b2;
    _out[1] = a1 * c2 + c1 * d2;
    _out[2] = a1 * tx2 + c1 * ty2 + tx1;

    _out[3] = b1 * a2 + d1 * b2;
    _out[4] = b1 * c2 + d1 * d2;
    _out[5] = b1 * tx2 + d1 * ty2 + ty1;
  }

  /**
   * Applies a rotation transformation to the given Affine2D object
   * and writes the result to out.
   *
   * This is a 2x2 rotation, it will not rotate
   **/
  static rotate(out: Affine2DLike, source: Affine2DLike, theta: number): void {
    /**
      Rotate object "after" other transforms

      [  a  b  tx ][  ma mb mtx ]
      [  c  d  ty ][  mc md mty ]
      [  0  0  1  ][  0  0  1   ]

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

  rotate(theta: number): Affine2D {
    Affine2D.rotate(this, this, theta);
    return this;
  }

  /**
   * Applies a scaling transformation to the matrix. The _x_ axis is
   * multiplied by `sx`, and the _y_ axis it is multiplied by `sy`.
   **/
  static scale(out: Affine2DLike, source: Affine2DLike, sx: number, sy: number): void {
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

  scale(sx: number, sy: number): Affine2D {
    Affine2D.scale(this, this, sx, sy);
    return this;
  }

  /**
   * Creates the specific style of matrix expected by the
   * `beginGradientFill()` and `lineGradientStyle()` methods of the
   * Graphics class. Width and height are scaled to a `scaleX`/`scaleY`
   * pair and the `tx`/`ty` values are offset by half the width and height.
   **/
  static setGradientTransform(
    out: Affine2DLike,
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

  static set(out: Affine2DLike, a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    out.m[0] = a;
    out.m[1] = b;
    out.m[3] = c;
    out.m[4] = d;
    out.m[2] = tx;
    out.m[5] = ty;
  }

  /**
   * Using `setTransform()` lets you obtain the same matrix as
   * if you applied `identity()`, `rotate()`, `scale()`, and
   * `translate()` in succession.
   **/
  static setTransform(
    out: Affine2DLike,
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
   * Transforms a point using the given matrix.
   * @see transformPointXY
   */
  static transformPoint(out: Vector2Like, matrix: Affine2DLike, point: Vector2Like): void {
    this.transformPointXY(out, matrix, point.x, point.y);
  }

  /**
   * Transforms an (x, y) point using the given matrix.
   */
  static transformPointXY(out: Vector2Like, source: Affine2DLike, x: number, y: number): void {
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
   * @see transformRectTo
   * @see transformAABB
   **/
  static transformRect(out: RectangleLike, matrix: Affine2DLike, source: RectangleLike): void {
    this.transformRectXY(out, matrix, source.x, source.y, source.x + source.width, source.y + source.height);
  }

  static transformRectVec2(out: RectangleLike, matrix: Affine2DLike, a: Vector2Like, b: Vector2Like): void {
    this.transformRectXY(out, matrix, a.x, a.y, b.x, b.y);
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
  static transformRectXY(
    out: RectangleLike,
    source: Affine2DLike,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): void {
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
   * Given a point in the pretransform coordinate space, returns the
   * coordinates of that point after the transformation occurs. Unlike the
   * standard transformation applied using the `transformPoint()`
   * method, the `transformVector()` method's transformation
   * does not consider the translation parameters `tx` and
   * `ty`.
   * @see transformVectorXY
   **/
  static transformVector(out: Vector2Like, matrix: Affine2DLike, vector: Vector2Like): void {
    this.transformVectorXY(out, matrix, vector.x, vector.y);
  }

  static transformVectorXY(out: Vector2Like, source: Affine2DLike, x: number, y: number): void {
    out.x = x * source.m[0] + y * source.m[3];
    out.y = x * source.m[1] + y * source.m[4];
  }

  /**
   * Translates the matrix along the _x_ and _y_ axes, as specified
   * by the `dx` and `dy` parameters.
   **/
  static translate(out: Affine2DLike, source: Affine2DLike, dx: number, dy: number): void {
    out.m[2] = source.m[2] + dx;
    out.m[5] = source.m[5] + dy;
  }

  translate(dx: number, dy: number): Affine2D {
    this.m[2] += dx;
    this.m[5] += dy;
    return this;
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
