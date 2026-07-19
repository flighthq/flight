import { describe, expect, it } from 'vitest';

import { createMatrix } from './matrix';
import { createTransform2D, decomposeMatrixToTransform2D } from './transform2d';

const DEG_TO_RAD = Math.PI / 180;

// Mirrors the display object's forward transform build (recomputeLocalTransform2D) so round-trip
// tests exercise the exact convention decomposeMatrixToTransform2D inverts.
function buildMatrix(x: number, y: number, rotation: number, scaleX: number, scaleY: number, skewX = 0, skewY = 0) {
  const radY = (rotation + skewY) * DEG_TO_RAD;
  const radX = (rotation + skewX) * DEG_TO_RAD;
  return createMatrix(
    Math.cos(radY) * scaleX,
    Math.sin(radY) * scaleX,
    -Math.sin(radX) * scaleY,
    Math.cos(radX) * scaleY,
    x,
    y,
  );
}

describe('createTransform2D', () => {
  it('defaults to the identity transform', () => {
    const t = createTransform2D();
    expect(t).toMatchObject({
      pivotX: 0,
      pivotY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      x: 0,
      y: 0,
    });
  });

  it('accepts positional fields', () => {
    const t = createTransform2D(10, 20, 45, 2, 3);
    expect(t).toMatchObject({ rotation: 45, scaleX: 2, scaleY: 3, x: 10, y: 20 });
  });
});

describe('decomposeMatrixToTransform2D', () => {
  it('decomposes the identity matrix', () => {
    const out = createTransform2D(99, 99, 99, 99, 99, 99, 99);
    decomposeMatrixToTransform2D(out, createMatrix());
    expect(out).toMatchObject({ rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, x: 0, y: 0 });
  });

  it('recovers translation and scale', () => {
    const out = createTransform2D();
    decomposeMatrixToTransform2D(out, buildMatrix(5, 7, 0, 2, 3));
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(7);
    expect(out.scaleX).toBeCloseTo(2);
    expect(out.scaleY).toBeCloseTo(3);
  });

  it('recovers a pure rotation with no skew', () => {
    const out = createTransform2D();
    decomposeMatrixToTransform2D(out, buildMatrix(0, 0, 30, 1, 1));
    expect(out.rotation).toBeCloseTo(30);
    expect(out.skewX).toBe(0);
    expect(out.skewY).toBe(0);
  });

  it('round-trips a skewed transform, folding the angles into skew', () => {
    const out = createTransform2D();
    decomposeMatrixToTransform2D(out, buildMatrix(0, 0, 0, 1, 1, 10, 20));
    expect(out.rotation).toBe(0);
    expect(out.skewX).toBeCloseTo(10);
    expect(out.skewY).toBeCloseTo(20);
  });

  it('carries a reflection on scaleY', () => {
    const out = createTransform2D();
    // A mirror across X: determinant negative.
    decomposeMatrixToTransform2D(out, createMatrix(1, 0, 0, -1, 0, 0));
    expect(out.scaleX).toBeCloseTo(1);
    expect(out.scaleY).toBeCloseTo(-1);
  });
});
