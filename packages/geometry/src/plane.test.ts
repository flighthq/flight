import {
  clonePlane,
  copyPlane,
  createPlane,
  createVector3,
  getPlaneSignedDistanceToPoint,
  setPlane,
} from '@flighthq/geometry';

describe('clonePlane', () => {
  it('creates an independent copy', () => {
    const p = createPlane(1, 0, 0, -5);
    const c = clonePlane(p);
    expect(c).not.toBe(p);
    expect(c.a).toBe(1);
    expect(c.d).toBe(-5);
  });
});

describe('copyPlane', () => {
  it('copies all coefficients', () => {
    const src = createPlane(0, 1, 0, 3);
    const out = createPlane();
    copyPlane(out, src);
    expect(out.a).toBe(0);
    expect(out.b).toBe(1);
    expect(out.c).toBe(0);
    expect(out.d).toBe(3);
  });

  it('supports out === source', () => {
    const p = createPlane(2, 3, 4, 5);
    copyPlane(p, p);
    expect(p.a).toBe(2);
    expect(p.d).toBe(5);
  });
});

describe('createPlane', () => {
  it('defaults to zeros', () => {
    const p = createPlane();
    expect(p.a).toBe(0);
    expect(p.b).toBe(0);
    expect(p.c).toBe(0);
    expect(p.d).toBe(0);
  });

  it('uses provided coefficients', () => {
    const p = createPlane(1, 2, 3, 4);
    expect(p.a).toBe(1);
    expect(p.b).toBe(2);
    expect(p.c).toBe(3);
    expect(p.d).toBe(4);
  });
});

describe('getPlaneSignedDistanceToPoint', () => {
  it('is positive on the normal side and negative behind', () => {
    // Plane x = 0 with normal +x.
    const p = createPlane(1, 0, 0, 0);
    expect(getPlaneSignedDistanceToPoint(p, createVector3(3, 0, 0))).toBeCloseTo(3, 6);
    expect(getPlaneSignedDistanceToPoint(p, createVector3(-2, 5, 9))).toBeCloseTo(-2, 6);
  });

  it('accounts for the plane offset', () => {
    // Plane x = 4 with normal +x => a*x + d = x - 4.
    const p = createPlane(1, 0, 0, -4);
    expect(getPlaneSignedDistanceToPoint(p, createVector3(4, 0, 0))).toBeCloseTo(0, 6);
  });
});

describe('setPlane', () => {
  it('sets all coefficients', () => {
    const p = createPlane();
    setPlane(p, 9, 8, 7, 6);
    expect(p.a).toBe(9);
    expect(p.b).toBe(8);
    expect(p.c).toBe(7);
    expect(p.d).toBe(6);
  });
});
