import {
  createAabb,
  createMatrix4,
  createObb,
  createRay3D,
  createVector3,
  getClosestPointOnObb,
  intersectRay3DObb,
  isObbIntersectingAabb,
  isObbIntersectingObb,
  matrix4TransformPoint,
  rotateMatrix4,
  setMatrix4Position,
  setObb,
  transformObbByMatrix4,
} from '@flighthq/geometry/contract';
import type { Matrix4, Obb } from '@flighthq/types/contract';

describe('createObb', () => {
  it('stores center, half-extents, and orientation', () => {
    const o = createObb(1, 2, 3, 4, 5, 6, 0, 0, 0, 1);
    expect(o.centerX).toBe(1);
    expect(o.centerY).toBe(2);
    expect(o.centerZ).toBe(3);
    expect(o.halfExtentX).toBe(4);
    expect(o.halfExtentY).toBe(5);
    expect(o.halfExtentZ).toBe(6);
    expect(o.orientationX).toBe(0);
    expect(o.orientationY).toBe(0);
    expect(o.orientationZ).toBe(0);
    expect(o.orientationW).toBe(1);
  });
});

describe('getClosestPointOnObb', () => {
  it('clamps an outside point to the nearest face of an axis-aligned OBB', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const out = createVector3();
    getClosestPointOnObb(out, o, createVector3(5, 0, 0));
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('returns a point inside the OBB unchanged', () => {
    const o = createObb(0, 0, 0, 2, 2, 2, 0, 0, 0, 1);
    const out = createVector3();
    getClosestPointOnObb(out, o, createVector3(1, 0.5, -0.5));
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBeCloseTo(0.5, 6);
    expect(out.z).toBeCloseTo(-0.5, 6);
  });

  it('handles off-center OBB with identity orientation', () => {
    const o = createObb(10, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const out = createVector3();
    getClosestPointOnObb(out, o, createVector3(0, 0, 0));
    expect(out.x).toBeCloseTo(9, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('supports out === point', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const p = createVector3(5, 0, 0);
    getClosestPointOnObb(p, o, p);
    expect(p.x).toBeCloseTo(1, 6);
  });
});

describe('intersectRay3DObb', () => {
  it('hits a unit OBB at the expected t from outside', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    // Ray from (5,0,0) pointing in -X: should enter at x=1, t=4.
    const ray = createRay3D(5, 0, 0, -1, 0, 0);
    const t = intersectRay3DObb(ray, o);
    expect(t).toBeCloseTo(4, 6);
  });

  it('returns -1 for a ray pointing away from the OBB', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const ray = createRay3D(5, 0, 0, 1, 0, 0);
    expect(intersectRay3DObb(ray, o)).toBe(-1);
  });

  it('returns 0 for a ray starting inside the OBB', () => {
    const o = createObb(0, 0, 0, 2, 2, 2, 0, 0, 0, 1);
    const ray = createRay3D(0, 0, 0, 0, 0, 1);
    expect(intersectRay3DObb(ray, o)).toBe(0);
  });

  it('returns -1 for a ray that misses an off-center OBB', () => {
    const o = createObb(10, 10, 10, 1, 1, 1, 0, 0, 0, 1);
    const ray = createRay3D(0, 0, 0, 1, 0, 0);
    expect(intersectRay3DObb(ray, o)).toBe(-1);
  });
});

describe('isObbIntersectingAabb', () => {
  it('returns true for coincident OBB and AABB', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isObbIntersectingAabb(o, a)).toBe(true);
  });

  it('returns true for overlapping OBB and AABB', () => {
    const o = createObb(0.5, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isObbIntersectingAabb(o, a)).toBe(true);
  });

  it('returns false for separated OBB and AABB', () => {
    const o = createObb(10, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isObbIntersectingAabb(o, a)).toBe(false);
  });
});

describe('isObbIntersectingObb', () => {
  it('returns true for two coincident OBBs', () => {
    const a = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const b = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    expect(isObbIntersectingObb(a, b)).toBe(true);
  });

  it('returns true for two overlapping OBBs', () => {
    const a = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const b = createObb(1.5, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    expect(isObbIntersectingObb(a, b)).toBe(true);
  });

  it('returns false for two separated OBBs', () => {
    const a = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const b = createObb(10, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    expect(isObbIntersectingObb(a, b)).toBe(false);
  });
});

describe('setObb', () => {
  it('updates all fields in place', () => {
    const o = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    setObb(o, 1, 2, 3, 4, 5, 6, 0.1, 0.2, 0.3, 0.9);
    expect(o.centerX).toBe(1);
    expect(o.centerY).toBe(2);
    expect(o.centerZ).toBe(3);
    expect(o.halfExtentX).toBe(4);
    expect(o.halfExtentY).toBe(5);
    expect(o.halfExtentZ).toBe(6);
    expect(o.orientationX).toBe(0.1);
    expect(o.orientationW).toBe(0.9);
  });
});

describe('transformObbByMatrix4', () => {
  it('translates the center by a translation matrix', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(5, 0, 0));
    const out = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    transformObbByMatrix4(out, o, m);
    expect(out.centerX).toBeCloseTo(5, 6);
    expect(out.centerY).toBeCloseTo(0, 6);
    expect(out.halfExtentX).toBeCloseTo(1, 6);
    expect(out.orientationW).toBeCloseTo(1, 5);
  });

  it('scales half-extents by a uniform scale matrix', () => {
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const m = createMatrix4(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1);
    const out = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    transformObbByMatrix4(out, o, m);
    expect(out.halfExtentX).toBeCloseTo(2, 6);
    expect(out.halfExtentY).toBeCloseTo(2, 6);
    expect(out.halfExtentZ).toBeCloseTo(2, 6);
  });

  it('supports out === obb', () => {
    const o = createObb(1, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(0, 3, 0));
    transformObbByMatrix4(o, o, m);
    expect(o.centerX).toBeCloseTo(1, 6);
    expect(o.centerY).toBeCloseTo(3, 6);
    expect(o.halfExtentX).toBeCloseTo(1, 6);
  });

  it('rotates the box the same way the matrix rotates points', () => {
    // The orientation extracted from the matrix must turn the box in the matrix's own direction.
    // A conjugated extraction turns it by the same angle about the opposite axis, which is
    // invisible for axis-aligned boxes and half turns but wrong for every general rotation.
    expectTransformedObbMatchesRotatedPoints(rotationMatrix4(1, 0, 0, 0.7), createTiltedObb());
    expectTransformedObbMatchesRotatedPoints(rotationMatrix4(1, 2, 3, 0.9), createTiltedObb());
  });

  it('rotates the box correctly near a half turn about each axis', () => {
    // A half turn drives the three `trace <= 0` branches of the matrix-to-quaternion extraction,
    // one per dominant diagonal term. Just short of pi so the conjugate is a different rotation:
    // at exactly pi the quaternion equals its own conjugate up to sign and hides an error.
    const nearHalfTurn = Math.PI - 0.01;
    expectTransformedObbMatchesRotatedPoints(rotationMatrix4(1, 0, 0, nearHalfTurn), createTiltedObb());
    expectTransformedObbMatchesRotatedPoints(rotationMatrix4(0, 1, 0, nearHalfTurn), createTiltedObb());
    expectTransformedObbMatchesRotatedPoints(rotationMatrix4(0, 0, 1, nearHalfTurn), createTiltedObb());
  });

  it('leaves half-extents and orientation untouched for a zero-scale matrix column', () => {
    // A collapsed column has no direction to read, so the rotation falls back to that identity
    // axis rather than dividing by zero; the half-extent along it collapses to zero.
    const o = createObb(0, 0, 0, 2, 3, 4, 0, 0, 0, 1);
    const m = createMatrix4(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const out = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    transformObbByMatrix4(out, o, m);
    expect(out.halfExtentX).toBe(0);
    expect(out.halfExtentY).toBeCloseTo(3, 6);
    expect(out.halfExtentZ).toBeCloseTo(4, 6);
    expect(out.orientationW).toBeCloseTo(1, 6);
  });
});

// An OBB with three distinct half-extents at an orientation that shares no axis with the world,
// so no box symmetry can mask a wrong rotation. Axis (1, 2, 3) normalized, turned by 0.8 radians.
function createTiltedObb(): Obb {
  const axisLength = Math.sqrt(14);
  const half = Math.sin(0.4);
  return createObb(
    0,
    0,
    0,
    3,
    2,
    1,
    (1 / axisLength) * half,
    (2 / axisLength) * half,
    (3 / axisLength) * half,
    Math.cos(0.4),
  );
}

// Asserts the transformed OBB sits where the matrix puts the original: for probe points all around
// it, the closest point on the transformed box equals the transformed closest point on the original.
// This reads the orientation through the same axes every OBB query uses, so it fails on any
// orientation error rather than on a chosen quaternion convention.
function expectTransformedObbMatchesRotatedPoints(m: Readonly<Matrix4>, obb: Readonly<Obb>): void {
  const transformed = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
  transformObbByMatrix4(transformed, obb, m);

  const expected = createVector3();
  const actual = createVector3();
  const probe = createVector3();

  for (const [px, py, pz] of [
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 10],
    [4, -6, 2],
    [-5, 3, 8],
    [7, 7, -7],
  ]) {
    getClosestPointOnObb(expected, obb, createVector3(px, py, pz));
    matrix4TransformPoint(expected, m, expected);

    matrix4TransformPoint(probe, m, createVector3(px, py, pz));
    getClosestPointOnObb(actual, transformed, probe);

    expect(actual.x).toBeCloseTo(expected.x, 4);
    expect(actual.y).toBeCloseTo(expected.y, 4);
    expect(actual.z).toBeCloseTo(expected.z, 4);
  }
}

// `rotateMatrix4` expects a unit axis, so normalize here rather than at every call site.
function rotationMatrix4(axisX: number, axisY: number, axisZ: number, radians: number): Matrix4 {
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
  const m = createMatrix4();
  rotateMatrix4(m, m, createVector3(axisX / length, axisY / length, axisZ / length), radians);
  return m;
}
