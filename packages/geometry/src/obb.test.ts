import {
  createAabb,
  createMatrix4,
  createObb,
  createRay3D,
  createVector3,
  crossVector3,
  getClosestPointOnObb,
  intersectRay3DObb,
  isObbIntersectingAabb,
  isObbIntersectingObb,
  matrix4TransformPoint,
  normalizeVector3,
  rotateMatrix4,
  setMatrix4Position,
  setObb,
  transformObbByMatrix4,
} from '@flighthq/geometry/contract';
import type { Matrix4, Obb, Vector3 } from '@flighthq/types/contract';

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

  it('returns -1 for a ray with no direction, inside the box or out', () => {
    // A zero-length direction is not a ray, so it never hits anything — the same answer the
    // sphere, capsule, plane and triangle tests give, and not a containment test in disguise.
    const o = createObb(0, 0, 0, 1, 1, 1, 0, 0, 0, 1);
    expect(intersectRay3DObb(createRay3D(0.5, 0.5, 0.5, 0, 0, 0), o)).toBe(-1);
    expect(intersectRay3DObb(createRay3D(5, 0, 0, 0, 0, 0), o)).toBe(-1);
  });

  it('hits a flat OBB whose half-extent along one axis is zero', () => {
    // A collapsed axis is a plane, not an empty volume: the slab still has a finite entry point.
    const o = createObb(0, 0, 0, 0, 1, 1, 0, 0, 0, 1);
    expect(intersectRay3DObb(createRay3D(5, 0, 0, -1, 0, 0), o)).toBeCloseTo(5, 6);
    expect(intersectRay3DObb(createRay3D(5, 3, 0, -1, 0, 0), o)).toBe(-1);
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

  it.each([
    ['x', createAabb(1, 0, 0, 0, 1, 1)],
    ['y', createAabb(0, 1, 0, 1, 0, 1)],
    ['z', createAabb(0, 0, 1, 1, 1, 0)],
  ])('returns false for an AABB empty on %s', (_axis, empty) => {
    const o = createObb(0, 0, 0, 10, 10, 10, 0, 0, 0, 1);
    expect(isObbIntersectingAabb(o, empty)).toBe(false);
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

  it('separates on each of the six face axes on its own', () => {
    // Six of the fifteen candidate axes are the two boxes' own faces. Each case below is tuned so
    // that ONE named axis is the only one of the fifteen that separates the pair — pushed just
    // past where that face clears and no further. That is what makes the case pin its axis: drop
    // that single check and the pair reads as a hit, where a pair separated on several axes at
    // once would still be rejected by one of the others and hide the loss.
    const tilt = orientationFromAxisAngle(1, 2, 3, 0.9);
    const tiltAsMatrix = rotationMatrix4(1, 2, 3, 0.9);
    const first = createObb(0, 0, 0, 1, 2, 3, 0, 0, 0, 1);

    for (const { axis, ofTurnedBox, extents, clear } of FACE_AXIS_SEPARATIONS) {
      const direction = createUnitVector3(axis);
      if (ofTurnedBox) matrix4TransformPoint(direction, tiltAsMatrix, direction);

      const away = createObb(
        direction.x * clear,
        direction.y * clear,
        direction.z * clear,
        extents[0],
        extents[1],
        extents[2],
        ...tilt,
      );
      expect(isObbIntersectingObb(first, away)).toBe(false);

      const concentric = createObb(0, 0, 0, extents[0], extents[1], extents[2], ...tilt);
      expect(isObbIntersectingObb(first, concentric)).toBe(true);
    }
  });

  it('separates on every one of the nine edge-cross axes', () => {
    // The nine edge axes are nine hand-written index permutations of one cross-product, so a
    // transposed subscript in any single one is invisible until that exact edge pair decides a
    // case. Each pair below is a rod along one local axis of each box, thin enough and offset
    // along their common perpendicular by little enough that its own cross axis is the only
    // separating axis in the whole set: a wrong expression there reads as a hit.
    const tilt = orientationFromAxisAngle(1, 2, 3, 0.9);
    const tiltAsMatrix = rotationMatrix4(1, 2, 3, 0.9);
    const rodLongDirection = createVector3();

    for (let firstLongAxis = 0; firstLongAxis < 3; firstLongAxis++) {
      for (let secondLongAxis = 0; secondLongAxis < 3; secondLongAxis++) {
        const first = createRodObb(0, 0, 0, firstLongAxis, 0, 0, 0, 1);
        matrix4TransformPoint(rodLongDirection, tiltAsMatrix, createUnitVector3(secondLongAxis));

        const perpendicular = createVector3();
        crossVector3(perpendicular, createUnitVector3(firstLongAxis), rodLongDirection);
        normalizeVector3(perpendicular, perpendicular);

        const clear = 0.3;
        const separated = createRodObb(
          perpendicular.x * clear,
          perpendicular.y * clear,
          perpendicular.z * clear,
          secondLongAxis,
          ...tilt,
        );
        expect(isObbIntersectingObb(first, separated)).toBe(false);

        const concentric = createRodObb(0, 0, 0, secondLongAxis, ...tilt);
        expect(isObbIntersectingObb(first, concentric)).toBe(true);
      }
    }
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

  it('flattens the box along a collapsed matrix column and keeps the other extents', () => {
    // A zero-length column has no direction to read, so that axis falls back to its identity
    // direction rather than dividing by zero, and the half-extent along it goes to zero.
    const o = createObb(0, 0, 0, 2, 3, 4, 0, 0, 0, 1);
    const m = createMatrix4(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const out = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    transformObbByMatrix4(out, o, m);
    expect(out.halfExtentX).toBe(0);
    expect(out.halfExtentY).toBeCloseTo(3, 6);
    expect(out.halfExtentZ).toBeCloseTo(4, 6);
    expect(out.orientationW).toBeCloseTo(1, 6);
  });

  it('collapses the box to a point at the matrix position when every column is zero', () => {
    // All three columns collapse, so the fallback rotation is the identity and the box keeps the
    // orientation it came in with — the transform contributes nothing but the translation.
    const tilt = orientationFromAxisAngle(1, 1, 1, 0.6);
    const o = createObb(1, 2, 3, 2, 3, 4, ...tilt);
    const m = createMatrix4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 1);
    const out = createObb(0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    transformObbByMatrix4(out, o, m);
    expect(out.centerX).toBeCloseTo(5, 6);
    expect(out.centerY).toBeCloseTo(6, 6);
    expect(out.centerZ).toBeCloseTo(7, 6);
    expect(out.halfExtentX).toBe(0);
    expect(out.halfExtentY).toBe(0);
    expect(out.halfExtentZ).toBe(0);
    expect(out.orientationX).toBeCloseTo(tilt[0], 6);
    expect(out.orientationY).toBeCloseTo(tilt[1], 6);
    expect(out.orientationZ).toBeCloseTo(tilt[2], 6);
    expect(out.orientationW).toBeCloseTo(tilt[3], 6);
  });
});

// A thin rod: long along one of its own local axes, barely thick along the other two, so the
// dominant feature of the box is a single edge direction.
function createRodObb(
  centerX: number,
  centerY: number,
  centerZ: number,
  longAxis: number,
  orientationX: number,
  orientationY: number,
  orientationZ: number,
  orientationW: number,
): Obb {
  const thickness = 0.1;
  return createObb(
    centerX,
    centerY,
    centerZ,
    longAxis === 0 ? 3 : thickness,
    longAxis === 1 ? 3 : thickness,
    longAxis === 2 ? 3 : thickness,
    orientationX,
    orientationY,
    orientationZ,
    orientationW,
  );
}

// An OBB with three distinct half-extents at an orientation that shares no axis with the world,
// so no box symmetry can mask a wrong rotation. Axis (1, 2, 3) normalized, turned by 0.8 radians.
function createTiltedObb(): Obb {
  return createObb(0, 0, 0, 3, 2, 1, ...orientationFromAxisAngle(1, 2, 3, 0.8));
}

function createUnitVector3(axis: number): Vector3 {
  return createVector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0);
}

// The `orientationX, orientationY, orientationZ, orientationW` arguments `createObb` and `setObb`
// take, spelled as a turn about an axis so the test states the rotation rather than four decimals.
function orientationFromAxisAngle(
  axisX: number,
  axisY: number,
  axisZ: number,
  radians: number,
): [number, number, number, number] {
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
  const half = Math.sin(radians / 2);
  return [(axisX / length) * half, (axisY / length) * half, (axisZ / length) * half, Math.cos(radians / 2)];
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

// One case per face axis of the two boxes in `separates on each of the six face axes on its own`.
// The first box is fixed at half-extents (1, 2, 3); the second carries the listed half-extents and
// a turn about (1, 2, 3), pushed `clear` along the named axis — `axis` indexes x, y, z, and
// `ofTurnedBox` says whether that is the second box's own axis rather than a world one. The
// shapes and distances are the ones for which that axis, and only it, separates the pair.
const FACE_AXIS_SEPARATIONS: ReadonlyArray<{
  readonly axis: number;
  readonly ofTurnedBox: boolean;
  readonly extents: readonly [number, number, number];
  readonly clear: number;
}> = [
  { axis: 0, clear: 3.8, extents: [2.5, 1.5, 0.5], ofTurnedBox: false },
  { axis: 1, clear: 4.9, extents: [2.5, 1.5, 0.5], ofTurnedBox: false },
  { axis: 2, clear: 5.9, extents: [0.5, 1.5, 2.5], ofTurnedBox: false },
  { axis: 0, clear: 3.6, extents: [0.5, 1.5, 2.5], ofTurnedBox: true },
  { axis: 1, clear: 4.7, extents: [0.5, 1.5, 2.5], ofTurnedBox: true },
  { axis: 2, clear: 3.7, extents: [2.5, 1.5, 0.5], ofTurnedBox: true },
];
