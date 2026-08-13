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

  it('round-trips a mirrored matrix through the forward build', () => {
    expectRoundTrip(createMatrix(1, 0, 0, -1, 0, 0));
    expectRoundTrip(createMatrix(-1, 0, 0, 1, 0, 0));
    expectRoundTrip(createMatrix(0.5, 0.8, 0.8, -0.5, 3, 4));
  });

  // The failure set is the negative-determinant set on any input, not a mirror-specific shape, so the
  // property is asserted over a grid spanning both determinant signs rather than at hand-picked cases.
  it('round-trips every non-degenerate matrix in a grid spanning both determinant signs', () => {
    const values = [-2, -1, -0.5, 0.5, 1, 2];
    let negativeDeterminantCount = 0;
    for (const a of values) {
      for (const b of values) {
        for (const c of values) {
          for (const d of values) {
            if (Math.abs(a * d - b * c) < 1e-9) continue;
            if (a * d - b * c < 0) negativeDeterminantCount++;
            expectRoundTrip(createMatrix(a, b, c, d, 0, 0));
          }
        }
      }
    }
    // Guards the guard: a grid that stopped covering reflections would still pass every assertion above.
    expect(negativeDeterminantCount).toBe(572);
  });
});

// Decomposing and rebuilding through the forward convention must reproduce the original cells. This is
// the losslessness `setNodeLocalMatrix` promises its callers, and it holds for both determinant signs.
function expectRoundTrip(source: Readonly<ReturnType<typeof createMatrix>>) {
  const out = createTransform2D();
  decomposeMatrixToTransform2D(out, source);
  const rebuilt = buildMatrix(out.x, out.y, out.rotation, out.scaleX, out.scaleY, out.skewX, out.skewY);
  expect(rebuilt.a).toBeCloseTo(source.a);
  expect(rebuilt.b).toBeCloseTo(source.b);
  expect(rebuilt.c).toBeCloseTo(source.c);
  expect(rebuilt.d).toBeCloseTo(source.d);
}
