import {
  cloneAabb,
  copyAabb,
  createAabb,
  createBoundingSphere,
  createMatrix4,
  createVector3,
  expandAabbByPoint,
  expandAabbBySphere,
  getAabbCenter,
  getAabbContainsPoint,
  getAabbExtents,
  getAabbSize,
  getClosestPointOnAabb,
  intersectAabb,
  isAabbIntersectingAabb,
  setAabb,
  setAabbFromPoints,
  setMatrix4Position,
  transformAabbByMatrix4,
  unionAabb,
} from '@flighthq/geometry';

describe('cloneAabb', () => {
  it('creates an independent copy with independent corner vectors', () => {
    const a = createAabb(-1, -2, -3, 4, 5, 6);
    const c = cloneAabb(a);
    expect(c).not.toBe(a);
    expect(c.min).not.toBe(a.min);
    expect(c.min.x).toBe(-1);
    expect(c.max.z).toBe(6);
    c.min.x = 99;
    expect(a.min.x).toBe(-1);
  });
});

describe('copyAabb', () => {
  it('copies both corners', () => {
    const src = createAabb(-1, -2, -3, 4, 5, 6);
    const out = createAabb();
    copyAabb(out, src);
    expect(out.min.x).toBe(-1);
    expect(out.max.y).toBe(5);
  });

  it('supports out === source', () => {
    const a = createAabb(-1, -2, -3, 4, 5, 6);
    copyAabb(a, a);
    expect(a.min.x).toBe(-1);
    expect(a.max.z).toBe(6);
  });
});

describe('createAabb', () => {
  it('defaults to an empty box (min > max)', () => {
    const a = createAabb();
    expect(a.min.x).toBe(Number.POSITIVE_INFINITY);
    expect(a.max.x).toBe(Number.NEGATIVE_INFINITY);
  });

  it('uses provided corners', () => {
    const a = createAabb(1, 2, 3, 4, 5, 6);
    expect(a.min.x).toBe(1);
    expect(a.max.z).toBe(6);
  });
});

describe('expandAabbByPoint', () => {
  it('an empty box snaps exactly to the first point', () => {
    const a = createAabb();
    const out = createAabb();
    expandAabbByPoint(out, a, createVector3(2, 3, 4));
    expect(out.min.x).toBe(2);
    expect(out.max.x).toBe(2);
    expect(out.min.z).toBe(4);
    expect(out.max.z).toBe(4);
  });

  it('grows to include a point outside the box', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const out = createAabb();
    expandAabbByPoint(out, a, createVector3(-5, 2, 0.5));
    expect(out.min.x).toBe(-5);
    expect(out.max.y).toBe(2);
    expect(out.max.z).toBe(1);
  });

  it('supports out === aabb', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    expandAabbByPoint(a, a, createVector3(3, -3, 3));
    expect(a.min.y).toBe(-3);
    expect(a.max.x).toBe(3);
  });
});

describe('expandAabbBySphere', () => {
  it('grows the box to contain the sphere', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const s = createBoundingSphere(0, 0, 0, 3);
    const out = createAabb();
    expandAabbBySphere(out, a, s);
    expect(out.min.x).toBe(-3);
    expect(out.max.x).toBe(3);
    expect(out.min.y).toBe(-3);
    expect(out.max.y).toBe(3);
  });

  it('an empty sphere leaves the box unchanged', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const s = createBoundingSphere(0, 0, 0, -1);
    const out = createAabb();
    expandAabbBySphere(out, a, s);
    expect(out.min.x).toBe(0);
    expect(out.max.x).toBe(1);
  });

  it('supports out === aabb', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const s = createBoundingSphere(5, 0, 0, 1);
    expandAabbBySphere(a, a, s);
    expect(a.max.x).toBe(6);
  });
});

describe('getAabbCenter', () => {
  it('writes the midpoint of the corners', () => {
    const a = createAabb(-2, -4, -6, 2, 4, 6);
    const out = createVector3();
    getAabbCenter(out, a);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.z).toBe(0);
  });
});

describe('getAabbContainsPoint', () => {
  it('returns true for an interior point and on the boundary', () => {
    const a = createAabb(0, 0, 0, 2, 2, 2);
    expect(getAabbContainsPoint(a, createVector3(1, 1, 1))).toBe(true);
    expect(getAabbContainsPoint(a, createVector3(0, 2, 0))).toBe(true);
  });

  it('returns false for a point outside', () => {
    const a = createAabb(0, 0, 0, 2, 2, 2);
    expect(getAabbContainsPoint(a, createVector3(3, 1, 1))).toBe(false);
  });
});

describe('getAabbExtents', () => {
  it('writes half-widths of the box', () => {
    const a = createAabb(-2, -4, -6, 2, 4, 6);
    const out = createVector3();
    getAabbExtents(out, a);
    expect(out.x).toBe(2);
    expect(out.y).toBe(4);
    expect(out.z).toBe(6);
  });
});

describe('getAabbSize', () => {
  it('writes the full width/height/depth', () => {
    const a = createAabb(-1, -2, -3, 3, 6, 9);
    const out = createVector3();
    getAabbSize(out, a);
    expect(out.x).toBe(4);
    expect(out.y).toBe(8);
    expect(out.z).toBe(12);
  });
});

describe('getClosestPointOnAabb', () => {
  it('clamps an outside point to the nearest face', () => {
    const a = createAabb(0, 0, 0, 2, 2, 2);
    const out = createVector3();
    getClosestPointOnAabb(out, a, createVector3(5, -1, 1));
    expect(out.x).toBe(2);
    expect(out.y).toBe(0);
    expect(out.z).toBe(1);
  });

  it('returns the point unchanged when it is inside the box', () => {
    const a = createAabb(0, 0, 0, 4, 4, 4);
    const out = createVector3();
    getClosestPointOnAabb(out, a, createVector3(1, 2, 3));
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('supports out === point', () => {
    const a = createAabb(0, 0, 0, 2, 2, 2);
    const p = createVector3(-3, 5, 1);
    getClosestPointOnAabb(p, a, p);
    expect(p.x).toBe(0);
    expect(p.y).toBe(2);
    expect(p.z).toBe(1);
  });
});

describe('intersectAabb', () => {
  it('produces the overlapping sub-box for two overlapping boxes', () => {
    const a = createAabb(0, 0, 0, 4, 4, 4);
    const b = createAabb(2, 2, 2, 6, 6, 6);
    const out = createAabb();
    intersectAabb(out, a, b);
    expect(out.min.x).toBe(2);
    expect(out.max.x).toBe(4);
    expect(out.min.y).toBe(2);
    expect(out.max.y).toBe(4);
  });

  it('produces an empty box (min > max) for non-overlapping boxes', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(5, 5, 5, 6, 6, 6);
    const out = createAabb();
    intersectAabb(out, a, b);
    // min > max in at least one axis
    expect(out.min.x).toBeGreaterThan(out.max.x);
  });

  it('supports out === a', () => {
    const a = createAabb(0, 0, 0, 4, 4, 4);
    const b = createAabb(2, 2, 2, 6, 6, 6);
    intersectAabb(a, a, b);
    expect(a.min.x).toBe(2);
    expect(a.max.x).toBe(4);
  });
});

describe('isAabbIntersectingAabb', () => {
  it('returns true for overlapping boxes', () => {
    const a = createAabb(0, 0, 0, 2, 2, 2);
    const b = createAabb(1, 1, 1, 3, 3, 3);
    expect(isAabbIntersectingAabb(a, b)).toBe(true);
  });

  it('returns true for touching boxes (shared face)', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(1, 0, 0, 2, 1, 1);
    expect(isAabbIntersectingAabb(a, b)).toBe(true);
  });

  it('returns false for separated boxes', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(5, 5, 5, 6, 6, 6);
    expect(isAabbIntersectingAabb(a, b)).toBe(false);
  });
});

describe('setAabb', () => {
  it('sets both corners', () => {
    const a = createAabb();
    setAabb(a, -1, -1, -1, 1, 1, 1);
    expect(a.min.x).toBe(-1);
    expect(a.max.z).toBe(1);
  });
});

describe('setAabbFromPoints', () => {
  it('computes the tight box over a set of points', () => {
    const a = createAabb();
    setAabbFromPoints(a, [createVector3(1, 5, -2), createVector3(-3, 0, 4), createVector3(2, 2, 2)]);
    expect(a.min.x).toBe(-3);
    expect(a.min.y).toBe(0);
    expect(a.min.z).toBe(-2);
    expect(a.max.x).toBe(2);
    expect(a.max.y).toBe(5);
    expect(a.max.z).toBe(4);
  });

  it('empty list yields an empty box', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    setAabbFromPoints(a, []);
    expect(a.min.x).toBe(Number.POSITIVE_INFINITY);
    expect(a.max.x).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('transformAabbByMatrix4', () => {
  it('translates the box', () => {
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(10, 0, 0));
    const out = createAabb();
    transformAabbByMatrix4(out, a, m);
    expect(out.min.x).toBeCloseTo(9, 6);
    expect(out.max.x).toBeCloseTo(11, 6);
    expect(out.min.y).toBeCloseTo(-1, 6);
  });

  it('grows the box under a 45-degree rotation about z', () => {
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    // Column-major 45-degree z rotation.
    const c = Math.SQRT1_2;
    const m = createMatrix4(c, c, 0, 0, -c, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    const out = createAabb();
    transformAabbByMatrix4(out, a, m);
    // Rotated unit box spans +/- sqrt(2) in x and y.
    expect(out.max.x).toBeCloseTo(Math.SQRT2, 5);
    expect(out.min.x).toBeCloseTo(-Math.SQRT2, 5);
    expect(out.max.z).toBeCloseTo(1, 6);
  });

  it('supports out === aabb', () => {
    const a = createAabb(-1, -1, -1, 1, 1, 1);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(5, 5, 5));
    transformAabbByMatrix4(a, a, m);
    expect(a.min.x).toBeCloseTo(4, 6);
    expect(a.max.z).toBeCloseTo(6, 6);
  });
});

describe('unionAabb', () => {
  it('encloses both boxes', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(-2, 3, -1, -1, 5, 0);
    const out = createAabb();
    unionAabb(out, a, b);
    expect(out.min.x).toBe(-2);
    expect(out.min.z).toBe(-1);
    expect(out.max.y).toBe(5);
    expect(out.max.x).toBe(1);
  });

  it('supports out === a', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(-2, 0, 0, 0, 4, 0);
    unionAabb(a, a, b);
    expect(a.min.x).toBe(-2);
    expect(a.max.y).toBe(4);
  });

  it('supports out === b', () => {
    const a = createAabb(0, 0, 0, 1, 1, 1);
    const b = createAabb(-2, 0, 0, 0, 4, 0);
    unionAabb(b, a, b);
    expect(b.min.x).toBe(-2);
    expect(b.max.y).toBe(4);
  });
});
