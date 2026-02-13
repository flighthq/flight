import type { Matrix2D, Matrix3, Matrix4, Rectangle, Vector2, Vector3 } from '@flighthq/types';

/**
 * An Matrix2D object represents two-dimensional coordinate space.
 * It is a 2x3 matrix, with a, b, c, d for a two-dimensional transform,
 * and tx, ty for translation.
 *
 * [ a b tx ]
 * [ c d ty ]
 *
 * @see Vector2
 * @see Vector3
 * @see Transform
 * @see Rectangle
 */
export function create(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number): Matrix2D {
  return { a: a ?? 1, b: b ?? 0, c: c ?? 0, d: d ?? 1, tx: tx ?? 0, ty: ty ?? 0 };
}

export function clone(source: Readonly<Matrix2D>): Matrix2D {
  const m = create();
  copy(m, source);
  return m;
}

/**
 * Concatenates two affine 2D transforms:
 *
 *   out = a ∘ b
 *
 * Applies the transforms of matrix b onto (and after) matrix a.
 */
export function concat(out: Matrix2D, a: Readonly<Matrix2D>, b: Readonly<Matrix2D>): void {
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

export function copy(out: Matrix2D, source: Readonly<Matrix2D>): void {
  setTo(out, source.a, source.b, source.c, source.d, source.tx, source.ty);
}

/**
 * Copies a column from a vector. The z component will be ignored (3x2 matrix).
 */
export function copyColumnFrom(out: Matrix2D, column: number, source: Readonly<Vector3>): void {
  if (column > 2) {
    throw new RangeError('Column ' + column + ' out of bounds (2)');
  } else if (column === 0) {
    out.a = source.x;
    out.b = source.y;
  } else if (column === 1) {
    out.c = source.x;
    out.d = source.y;
  } else {
    out.tx = source.x;
    out.ty = source.y;
  }
}

/**
 * Copies a column to a vector. The z component will use identity values.
 */
export function copyColumnTo(out: Vector3, column: number, source: Readonly<Matrix2D>): void {
  if (column > 2) {
    throw new RangeError('Column ' + column + ' out of bounds (2)');
  } else if (column === 0) {
    out.x = source.a;
    out.y = source.b;
    out.z = 0;
  } else if (column === 1) {
    out.x = source.c;
    out.y = source.d;
    out.z = 0;
  } else {
    out.x = source.tx;
    out.y = source.ty;
    out.z = 1;
  }
}

/**
 * Copies a row from a vector. The third row (row 2) will be ignored (3x2 matrix).
 */
export function copyRowFrom(out: Matrix2D, row: number, source: Readonly<Vector3>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  } else if (row === 0) {
    out.a = source.x;
    out.c = source.y;
    out.tx = source.z;
  } else if (row === 1) {
    out.b = source.x;
    out.d = source.y;
    out.ty = source.z;
  }
}

/**
 * Copies a row to a vector. The third row will use identity values (3x2 matrix).
 */
export function copyRowTo(out: Vector3, row: number, source: Readonly<Matrix2D>): void {
  if (row > 2) {
    throw new RangeError('Row ' + row + ' out of bounds (2)');
  } else if (row === 0) {
    out.x = source.a;
    out.y = source.c;
    out.z = source.tx;
  } else if (row === 1) {
    out.x = source.b;
    out.y = source.d;
    out.z = source.ty;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 1;
  }
}

export function createGradientTransform(
  width: number,
  height: number,
  rotation: number = 0,
  tx: number = 0,
  ty: number = 0,
): Matrix2D {
  const out = create();
  setGradientTransform(out, width, height, rotation, tx, ty);
  return out;
}

export function createTransform(
  scaleX: number,
  scaleY: number,
  rotation: number = 0,
  tx: number = 0,
  ty: number = 0,
): Matrix2D {
  const out = create();
  setTransform(out, scaleX, scaleY, rotation, tx, ty);
  return out;
}

export function equals(
  a: Readonly<Matrix2D> | null | undefined,
  b: Readonly<Matrix2D> | null | undefined,
  compareTranslation: boolean = true,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    (!compareTranslation || (a.tx === b.tx && a.ty === b.ty)) &&
    a.a === b.a &&
    a.b === b.b &&
    a.c === b.c &&
    a.d === b.d
  );
}

export function fromMatrix3(out: Matrix2D, source: Readonly<Matrix3>): void {
  const m = source.m;
  setTo(out, m[0], m[1], m[3], m[4], m[2], m[5]);
}

export function fromMatrix4(out: Matrix2D, source: Readonly<Matrix4>): void {
  const s = source.m;
  out.a = s[0];
  out.b = s[4];
  out.tx = s[12];
  out.c = s[1];
  out.d = s[5];
  out.ty = s[13];
}

/**
 * Sets each matrix property to a value that causes a null
 * transformation. An object transformed by applying an identity matrix
 * will be identical to the original.
 * After calling the `identity()` method, the resulting matrix has the
 * following properties: `a`=1, `b`=0, `c`=0, `d`=1, `tx`=0, `ty`=0.
 **/
export function identity(out: Matrix2D): void {
  setTo(out, 1, 0, 0, 1, 0, 0);
}

/**
 * Computes the inverse of a 2D affine matrix and writes it to out.
 *
 * Translation (tx, ty) is applied after the linear transformation (scale/rotation/shear) is inverted.
 */
export function inverse(out: Matrix2D, source: Readonly<Matrix2D>): void {
  const det = source.a * source.d - source.c * source.b;
  if (det === 0) {
    out.a = out.b = out.c = out.d = 0;
    out.tx = -source.tx;
    out.ty = -source.ty;
  } else {
    const invDet = 1 / det;
    out.a = source.d * invDet;
    out.b = -source.b * invDet;
    out.c = -source.c * invDet;
    out.d = source.a * invDet;
    out.tx = -(out.a * source.tx + out.b * source.ty);
    out.ty = -(out.c * source.tx + out.d * source.ty);
  }
}

/**
 * Use an inverse of the source matrix to transform
 * a given point, including translation.
 * @see inverseTransformPointXY
 */
export function inverseTransformPoint(out: Vector2, matrix: Readonly<Matrix2D>, point: Readonly<Vector2>): void {
  inverseTransformPointXY(out, matrix, point.x, point.y);
}

export function inverseTransformPointXY(out: Vector2, source: Readonly<Matrix2D>, x: number, y: number): void {
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
 * Use an inverse of the source matrix to transform
 * a given point, excluding translation.
 * @see inverseTransformPointXY
 */
export function inverseTransformVector(out: Vector2, matrix: Readonly<Matrix2D>, vector: Readonly<Vector2>): void {
  inverseTransformVectorXY(out, matrix, vector.x, vector.y);
}

export function inverseTransformVectorXY(out: Vector2, source: Readonly<Matrix2D>, x: number, y: number): void {
  const norm = source.a * source.d - source.b * source.c;
  if (norm === 0) {
    out.x = 0;
    out.y = 0;
  } else {
    const px = (1.0 / norm) * (source.d * x - source.c * y);
    out.y = (1.0 / norm) * (-source.b * x + source.a * y);
    out.x = px;
  }
}

/**
 * Multiplies a by b and writes the result to out.
 *
 * out = a * b
 */
export function multiply(out: Matrix2D, a: Readonly<Matrix2D>, b: Readonly<Matrix2D>): void {
  const a1 = a.a,
    b1 = a.b,
    tx1 = a.tx,
    c1 = a.c,
    d1 = a.d,
    ty1 = a.ty;
  const a2 = b.a,
    b2 = b.b,
    tx2 = b.tx,
    c2 = b.c,
    d2 = b.d,
    ty2 = b.ty;

  out.a = a1 * a2 + c1 * b2;
  out.b = b1 * a2 + d1 * b2;
  out.tx = a1 * tx2 + c1 * ty2 + tx1;

  out.c = a1 * c2 + c1 * d2;
  out.d = b1 * c2 + d1 * d2;
  out.ty = b1 * tx2 + d1 * ty2 + ty1;
}

/**
 * Applies a rotation transformation to the given Matrix2D object
 * and writes the result to out.
 *
 * This is a 2x2 rotation, it will not rotate
 **/
export function rotate(out: Matrix2D, source: Readonly<Matrix2D>, theta: number): void {
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
 **/
export function scale(out: Matrix2D, source: Readonly<Matrix2D>, sx: number, sy: number): void {
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

/**
 * Creates the specific style of matrix expected by the
 * `beginGradientFill()` and `lineGradientStyle()` methods of the
 * Graphics class. Width and height are scaled to a `scaleX`/`scaleY`
 * pair and the `tx`/`ty` values are offset by half the width and height.
 **/
export function setGradientTransform(
  out: Matrix2D,
  width: number,
  height: number,
  rotation: number = 0,
  tx: number = 0,
  ty: number = 0,
): void {
  out.a = width / 1638.4;
  out.d = height / 1638.4;

  // rotation is clockwise
  if (rotation !== 0) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    out.b = sin * out.d;
    out.c = -sin * out.a;
    out.a *= cos;
    out.d *= cos;
  } else {
    out.b = 0;
    out.c = 0;
  }

  out.tx = tx + width / 2;
  out.ty = ty + height / 2;
}

export function setTo(out: Matrix2D, a: number, b: number, c: number, d: number, tx: number, ty: number): void {
  out.a = a;
  out.b = b;
  out.c = c;
  out.d = d;
  out.tx = tx;
  out.ty = ty;
}

/**
 * Using `setTransform()` lets you obtain the same matrix as
 * if you applied `identity()`, `rotate()`, `scale()`, and
 * `translate()` in succession.
 **/
export function setTransform(
  out: Matrix2D,
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

    out.a = cos * scaleX;
    out.b = sin * scaleY;
    out.c = -sin * scaleX;
    out.d = cos * scaleY;
  } else {
    out.a = scaleX;
    out.b = 0;
    out.c = 0;
    out.d = scaleY;
  }

  out.tx = tx;
  out.ty = ty;
}

/**
 * Transforms a point using the given matrix.
 * @see transformPointXY
 */
export function transformPoint(out: Vector2, matrix: Readonly<Matrix2D>, point: Readonly<Vector2>): void {
  transformPointXY(out, matrix, point.x, point.y);
}

/**
 * Transforms an (x, y) point using the given matrix.
 */
export function transformPointXY(out: Vector2, source: Readonly<Matrix2D>, x: number, y: number): void {
  out.x = x * source.a + y * source.c + source.tx;
  out.y = x * source.b + y * source.d + source.ty;
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
export function transformRect(out: Rectangle, matrix: Readonly<Matrix2D>, source: Readonly<Rectangle>): void {
  transformRectXY(out, matrix, source.x, source.y, source.x + source.width, source.y + source.height);
}

export function transformRectVec2(
  out: Rectangle,
  matrix: Readonly<Matrix2D>,
  a: Readonly<Vector2>,
  b: Readonly<Vector2>,
): void {
  transformRectXY(out, matrix, a.x, a.y, b.x, b.y);
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
export function transformRectXY(
  out: Rectangle,
  source: Readonly<Matrix2D>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const a = source.a;
  const b = source.b;
  const c = source.c;
  const d = source.d;

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
 * Given a point in the pretransform coordinate space, returns the
 * coordinates of that point after the transformation occurs. Un the
 * standard transformation applied using the `transformPoint()`
 * method, the `transformVector()` method's transformation
 * does not consider the translation parameters `tx` and
 * `ty`.
 * @see transformVectorXY
 **/
export function transformVector(out: Vector2, matrix: Readonly<Matrix2D>, vector: Readonly<Vector2>): void {
  transformVectorXY(out, matrix, vector.x, vector.y);
}

export function transformVectorXY(out: Vector2, source: Readonly<Matrix2D>, x: number, y: number): void {
  out.x = x * source.a + y * source.c;
  out.y = x * source.b + y * source.d;
}

/**
 * Translates the matrix along the _x_ and _y_ axes, as specified
 * by the `dx` and `dy` parameters.
 **/
export function translate(out: Matrix2D, source: Readonly<Matrix2D>, dx: number, dy: number): void {
  out.tx = source.tx + dx;
  out.ty = source.ty + dy;
}
