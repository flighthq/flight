import {
  cloneBoundingSphere,
  copyBoundingSphere,
  createAabb,
  createBoundingSphere,
  createMatrix4,
  createVector3,
  getBoundingSphereContainsPoint,
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

describe('getBoundingSphereContainsPoint', () => {
  it('returns true inside and on the surface', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    expect(getBoundingSphereContainsPoint(s, createVector3(1, 0, 0))).toBe(true);
    expect(getBoundingSphereContainsPoint(s, createVector3(2, 0, 0))).toBe(true);
  });

  it('returns false outside', () => {
    const s = createBoundingSphere(0, 0, 0, 2);
    expect(getBoundingSphereContainsPoint(s, createVector3(3, 0, 0))).toBe(false);
  });

  it('an empty sphere contains no points', () => {
    const s = createBoundingSphere(0, 0, 0, -1);
    expect(getBoundingSphereContainsPoint(s, createVector3(0, 0, 0))).toBe(false);
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
