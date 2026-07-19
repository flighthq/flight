import { createEntity } from '@flighthq/entity';
import type { MatrixLike, Transform2D, Transform2DLike } from '@flighthq/types';

// Allocates a decomposed 2D transform carrier. Defaults are the identity transform (no translation,
// no rotation, unit scale, no skew, pivot at origin).
export function createTransform2D(
  x?: number,
  y?: number,
  rotation?: number,
  scaleX?: number,
  scaleY?: number,
  skewX?: number,
  skewY?: number,
  pivotX?: number,
  pivotY?: number,
): Transform2D {
  return createEntity({
    pivotX: pivotX ?? 0,
    pivotY: pivotY ?? 0,
    rotation: rotation ?? 0,
    scaleX: scaleX ?? 1,
    scaleY: scaleY ?? 1,
    skewX: skewX ?? 0,
    skewY: skewY ?? 0,
    x: x ?? 0,
    y: y ?? 0,
  });
}

// Decomposes a 2D affine matrix into a `Transform2D` carrier's fields — the inverse of the display
// object's forward transform build. Lossless for the effective transform (2D is 6-DOF complete: skew
// spans the full affine), so `Matrix` round-trips. `rotation`/`skewX`/`skewY` are written in degrees.
//
// Pivot cannot be recovered from a matrix (it folds into translation on the forward pass), so it is
// reset to the origin and `x`/`y` receive the raw translation; the effective transform is unchanged.
export function decomposeMatrixToTransform2D(out: Transform2DLike, source: Readonly<MatrixLike>): void {
  const a = source.a;
  const b = source.b;
  const c = source.c;
  const d = source.d;
  const scaleX = Math.sqrt(a * a + b * b);
  // A negative determinant is a reflection one scale factor cannot absorb; carry it on scaleY.
  const scaleY = a * d - b * c < 0 ? -Math.sqrt(c * c + d * d) : Math.sqrt(c * c + d * d);
  // Forward: the c/d axis carries (rotation + skewX), the a/b axis carries (rotation + skewY).
  const skewXDegrees = Math.atan2(-c, d) * RAD_TO_DEG;
  const skewYDegrees = Math.atan2(b, a) * RAD_TO_DEG;
  if (skewXDegrees === skewYDegrees) {
    // Both axes share one angle: a pure rotation, no skew.
    out.rotation = skewYDegrees;
    out.skewX = 0;
    out.skewY = 0;
  } else {
    out.rotation = 0;
    out.skewX = skewXDegrees;
    out.skewY = skewYDegrees;
  }
  out.pivotX = 0;
  out.pivotY = 0;
  out.scaleX = scaleX;
  out.scaleY = scaleY;
  out.x = source.tx;
  out.y = source.ty;
}

const RAD_TO_DEG = 180 / Math.PI;
