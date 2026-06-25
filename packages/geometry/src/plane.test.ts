import {
  clonePlane,
  copyPlane,
  createPlane,
  createVector3,
  getClosestPointOnPlane,
  getPlaneCoplanarPoint,
  getPlaneSignedDistanceToPoint,
  normalizePlane,
  projectVector3OntoPlane,
  setPlane,
  setPlaneFromNormalAndPoint,
  setPlaneFromPoints,
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

describe('getClosestPointOnPlane', () => {
  it('projects a point onto the plane along the normal', () => {
    // Plane z = 0 => normal (0,0,1), d = 0.
    const p = createPlane(0, 0, 1, 0);
    const out = createVector3();
    getClosestPointOnPlane(out, p, createVector3(2, 3, 5));
    expect(out.x).toBeCloseTo(2, 6);
    expect(out.y).toBeCloseTo(3, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('leaves a point already on the plane in place', () => {
    const p = createPlane(1, 0, 0, -5);
    const out = createVector3();
    getClosestPointOnPlane(out, p, createVector3(5, 1, 2));
    expect(out.x).toBeCloseTo(5, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(2, 6);
  });

  it('agrees with projectVector3OntoPlane', () => {
    const p = createPlane(0, 1, 0, -3);
    const closest = createVector3();
    const projected = createVector3();
    getClosestPointOnPlane(closest, p, createVector3(4, 7, -2));
    projectVector3OntoPlane(projected, createVector3(4, 7, -2), p);
    expect(closest.x).toBeCloseTo(projected.x, 6);
    expect(closest.y).toBeCloseTo(projected.y, 6);
    expect(closest.z).toBeCloseTo(projected.z, 6);
  });

  it('supports out === point', () => {
    const p = createPlane(0, 0, 1, 0);
    const v = createVector3(1, 2, 9);
    getClosestPointOnPlane(v, p, v);
    expect(v.z).toBeCloseTo(0, 6);
  });
});

describe('getPlaneCoplanarPoint', () => {
  it('point on the plane has signed distance zero', () => {
    // Plane x = 5 => normal (+1,0,0), d = -5.
    const p = createPlane(1, 0, 0, -5);
    const out = createVector3();
    getPlaneCoplanarPoint(out, p);
    expect(getPlaneSignedDistanceToPoint(p, out)).toBeCloseTo(0, 6);
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

describe('normalizePlane', () => {
  it('normalizes a plane with non-unit normal', () => {
    // Normal (0,2,0), d=4 → normalized (0,1,0), d=2.
    const p = createPlane(0, 2, 0, 4);
    const out = createPlane();
    normalizePlane(out, p);
    expect(out.b).toBeCloseTo(1, 6);
    expect(out.d).toBeCloseTo(2, 6);
  });

  it('supports out === source', () => {
    const p = createPlane(0, 3, 0, 6);
    normalizePlane(p, p);
    expect(p.b).toBeCloseTo(1, 6);
    expect(p.d).toBeCloseTo(2, 6);
  });

  it('leaves a degenerate plane unchanged', () => {
    const p = createPlane(0, 0, 0, 5);
    const out = createPlane();
    normalizePlane(out, p);
    expect(out.d).toBe(5);
  });
});

describe('projectVector3OntoPlane', () => {
  it('projects a point above the XZ plane down to y=0', () => {
    // Plane y=0: normal (0,1,0), d=0.
    const plane = createPlane(0, 1, 0, 0);
    const out = createVector3();
    projectVector3OntoPlane(out, createVector3(3, 5, 2), plane);
    expect(out.x).toBeCloseTo(3, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(2, 6);
  });

  it('supports out === point', () => {
    const plane = createPlane(1, 0, 0, 0);
    const pt = createVector3(4, 2, 1);
    projectVector3OntoPlane(pt, pt, plane);
    expect(pt.x).toBeCloseTo(0, 6);
    expect(pt.y).toBeCloseTo(2, 6);
    expect(pt.z).toBeCloseTo(1, 6);
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

describe('setPlaneFromNormalAndPoint', () => {
  it('builds a plane that contains the given point', () => {
    const normal = createVector3(0, 1, 0);
    const point = createVector3(0, 5, 0);
    const p = createPlane();
    setPlaneFromNormalAndPoint(p, normal, point);
    expect(getPlaneSignedDistanceToPoint(p, point)).toBeCloseTo(0, 6);
  });

  it('stores the normal in (a, b, c)', () => {
    const normal = createVector3(1, 0, 0);
    const point = createVector3(3, 0, 0);
    const p = createPlane();
    setPlaneFromNormalAndPoint(p, normal, point);
    expect(p.a).toBeCloseTo(1, 6);
    expect(p.b).toBeCloseTo(0, 6);
    expect(p.c).toBeCloseTo(0, 6);
    expect(p.d).toBeCloseTo(-3, 6);
  });
});

describe('setPlaneFromPoints', () => {
  it('builds the XZ plane from three points in XZ', () => {
    const p = createPlane();
    setPlaneFromPoints(p, createVector3(0, 0, 0), createVector3(1, 0, 0), createVector3(0, 0, 1));
    // Normal should be +y (right-hand rule CCW from top)
    expect(Math.abs(p.b)).toBeCloseTo(1, 5);
    expect(p.a).toBeCloseTo(0, 5);
    expect(p.c).toBeCloseTo(0, 5);
  });

  it('all three points lie on the resulting plane', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 0, 1);
    const c = createVector3(-1, 3, 5);
    const p = createPlane();
    setPlaneFromPoints(p, a, b, c);
    expect(getPlaneSignedDistanceToPoint(p, a)).toBeCloseTo(0, 5);
    expect(getPlaneSignedDistanceToPoint(p, b)).toBeCloseTo(0, 5);
    expect(getPlaneSignedDistanceToPoint(p, c)).toBeCloseTo(0, 5);
  });
});
