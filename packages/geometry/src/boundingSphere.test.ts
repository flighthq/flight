import {
  cloneBoundingSphere,
  copyBoundingSphere,
  createAabb,
  createBoundingSphere,
  createMatrix4,
  createVector3,
  containsBoundingSpherePoint,
  getClosestPointOnBoundingSphere,
  isBoundingSphereIntersectingBoundingSphere,
  mergeBoundingSphere,
  setBoundingSphere,
  setBoundingSphereFromAabb,
  setMatrix4Position,
  transformBoundingSphereByMatrix4,
} from '@flighthq/geometry';

describe('cloneBoundingSphere', () => {
  it('creates an independent copy with an independent center', () => {
    const s = createBoundingSphere(1, 2, 3, 4);
    const c = cloneBoundingSphere(s);
    expect(c).not.toBe(s);
    expect(c.center).not.toBe(s.center);
    expect(c.center.x).toBe(1);
    expect(c.radius).toBe(4);
    c.center.x = 99;
    expect(s.center.x).toBe(1);
  });
});

describe('containsBoundingSpherePoint', () => {
  it('returns true inside and on the surface', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    expect(containsBoundingSpherePoint(s, createVector3(1, 0, 0))).toBe(true);
    expect(containsBoundingSpherePoint(s, createVector3(2, 0, 0))).toBe(true);
  });

  it('returns false outside', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    expect(containsBoundingSpherePoint(s, createVector3(3, 0, 0))).toBe(false);
  });

  it('an empty sphere contains no points', () => {
    const s = createBoundingSphere(0, 0, 0, -1);
    expect(containsBoundingSpherePoint(s, createVector3(0, 0, 0))).toBe(false);
  });
});

describe('copyBoundingSphere', () => {
  it('copies center and radius', () => {
    const src = createBoundingSphere(1, 2, 3, 4);
    const out = createBoundingSphere();
    copyBoundingSphere(out, src);
    expect(out.center.x).toBe(1);
    expect(out.radius).toBe(4);
  });

  it('supports out === source', () => {
    const s = createBoundingSphere(1, 2, 3, 4);
    copyBoundingSphere(s, s);
    expect(s.center.y).toBe(2);
    expect(s.radius).toBe(4);
  });
});

describe('createBoundingSphere', () => {
  it('defaults to an empty sphere (negative radius)', () => {
    const s = createBoundingSphere();
    expect(s.center.x).toBe(0);
    expect(s.radius).toBe(-1);
  });

  it('uses provided center and radius', () => {
    const s = createBoundingSphere(1, 2, 3, 5);
    expect(s.center.z).toBe(3);
    expect(s.radius).toBe(5);
  });
});

describe('getClosestPointOnBoundingSphere', () => {
  it('projects an outside point onto the surface', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    const out = createVector3();
    getClosestPointOnBoundingSphere(out, s, createVector3(10, 0, 0));
    expect(out.x).toBeCloseTo(2, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('pulls an inside point out to the surface', () => {
    const s = createBoundingSphere(0, 0, 0, 5);
    const out = createVector3();
    getClosestPointOnBoundingSphere(out, s, createVector3(0, 1, 0));
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(5, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('uses the +X fallback when the point is at the center', () => {
    const s = createBoundingSphere(1, 2, 3, 4);
    const out = createVector3();
    getClosestPointOnBoundingSphere(out, s, createVector3(1, 2, 3));
    expect(out.x).toBeCloseTo(5, 6);
    expect(out.y).toBeCloseTo(2, 6);
    expect(out.z).toBeCloseTo(3, 6);
  });

  it('writes the center for an empty sphere', () => {
    const s = createBoundingSphere(1, 2, 3, -1);
    const out = createVector3();
    getClosestPointOnBoundingSphere(out, s, createVector3(9, 9, 9));
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('supports out === point', () => {
    const s = createBoundingSphere(0, 0, 0, 3);
    const p = createVector3(6, 0, 0);
    getClosestPointOnBoundingSphere(p, s, p);
    expect(p.x).toBeCloseTo(3, 6);
  });
});

describe('isBoundingSphereIntersectingBoundingSphere', () => {
  it('returns true for overlapping spheres', () => {
    const a = createBoundingSphere(0, 0, 0, 2);
    const b = createBoundingSphere(3, 0, 0, 2);
    expect(isBoundingSphereIntersectingBoundingSphere(a, b)).toBe(true);
  });

  it('returns true for touching spheres', () => {
    const a = createBoundingSphere(0, 0, 0, 1);
    const b = createBoundingSphere(2, 0, 0, 1);
    expect(isBoundingSphereIntersectingBoundingSphere(a, b)).toBe(true);
  });

  it('returns false for separated spheres', () => {
    const a = createBoundingSphere(0, 0, 0, 1);
    const b = createBoundingSphere(5, 0, 0, 1);
    expect(isBoundingSphereIntersectingBoundingSphere(a, b)).toBe(false);
  });

  it('returns false if either sphere is empty', () => {
    const a = createBoundingSphere(0, 0, 0, 1);
    const empty = createBoundingSphere(0, 0, 0, -1);
    expect(isBoundingSphereIntersectingBoundingSphere(a, empty)).toBe(false);
    expect(isBoundingSphereIntersectingBoundingSphere(empty, a)).toBe(false);
  });
});

describe('mergeBoundingSphere', () => {
  it('merges two overlapping spheres into a containing sphere', () => {
    const a = createBoundingSphere(-1, 0, 0, 1);
    const b = createBoundingSphere(1, 0, 0, 1);
    const out = createBoundingSphere();
    mergeBoundingSphere(out, a, b);
    // Both original spheres must be contained.
    expect(containsBoundingSpherePoint(out, createVector3(-2, 0, 0))).toBe(true);
    expect(containsBoundingSpherePoint(out, createVector3(2, 0, 0))).toBe(true);
  });

  it('if a contains b, result equals a', () => {
    const a = createBoundingSphere(0, 0, 0, 10);
    const b = createBoundingSphere(1, 0, 0, 1);
    const out = createBoundingSphere();
    mergeBoundingSphere(out, a, b);
    expect(out.center.x).toBeCloseTo(0, 5);
    expect(out.radius).toBeCloseTo(10, 5);
  });

  it('empty source returns the other sphere', () => {
    const a = createBoundingSphere();
    const b = createBoundingSphere(3, 0, 0, 2);
    const out = createBoundingSphere();
    mergeBoundingSphere(out, a, b);
    expect(out.center.x).toBeCloseTo(3, 5);
    expect(out.radius).toBeCloseTo(2, 5);
  });

  it('supports out === a', () => {
    const a = createBoundingSphere(-1, 0, 0, 1);
    const b = createBoundingSphere(1, 0, 0, 1);
    mergeBoundingSphere(a, a, b);
    expect(containsBoundingSpherePoint(a, createVector3(-2, 0, 0))).toBe(true);
    expect(containsBoundingSpherePoint(a, createVector3(2, 0, 0))).toBe(true);
  });
});

describe('setBoundingSphere', () => {
  it('sets center and radius', () => {
    const s = createBoundingSphere();
    setBoundingSphere(s, 5, 6, 7, 8);
    expect(s.center.x).toBe(5);
    expect(s.radius).toBe(8);
  });
});

describe('setBoundingSphereFromAabb', () => {
  it('centers on the box and reaches its corners', () => {
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    const s = createBoundingSphere();
    setBoundingSphereFromAabb(s, aabb);
    expect(s.center.x).toBe(0);
    expect(s.center.y).toBe(0);
    expect(s.center.z).toBe(0);
    expect(s.radius).toBeCloseTo(Math.sqrt(3), 6);
  });

  it('an empty box yields an empty sphere', () => {
    const aabb = createAabb();
    const s = createBoundingSphere(0, 0, 0, 5);
    setBoundingSphereFromAabb(s, aabb);
    expect(s.radius).toBe(-1);
  });
});

describe('transformBoundingSphereByMatrix4', () => {
  it('translates the center and preserves the radius', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(10, 0, 0));
    const out = createBoundingSphere();
    transformBoundingSphereByMatrix4(out, s, m);
    expect(out.center.x).toBeCloseTo(10, 6);
    expect(out.radius).toBeCloseTo(2, 6);
  });

  it('scales the radius by the largest axis scale', () => {
    const s = createBoundingSphere(0, 0, 0, 1);
    // Column-major non-uniform scale diag(2,3,4).
    const m = createMatrix4(2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1);
    const out = createBoundingSphere();
    transformBoundingSphereByMatrix4(out, s, m);
    expect(out.radius).toBeCloseTo(4, 6);
  });

  it('supports out === sphere', () => {
    const s = createBoundingSphere(1, 0, 0, 2);
    const m = createMatrix4();
    setMatrix4Position(m, createVector3(0, 5, 0));
    transformBoundingSphereByMatrix4(s, s, m);
    expect(s.center.x).toBeCloseTo(1, 6);
    expect(s.center.y).toBeCloseTo(5, 6);
    expect(s.radius).toBeCloseTo(2, 6);
  });
});
