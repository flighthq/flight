import {
  createBoundingSphere,
  createCapsule,
  createRay3D,
  createVector3,
  getClosestPointOnCapsule,
  intersectRay3DCapsule,
  isCapsuleIntersectingCapsule,
  isCapsuleIntersectingSphere,
  setCapsule,
} from '@flighthq/geometry';

describe('createCapsule', () => {
  it('stores all fields', () => {
    const c = createCapsule(1, 2, 3, 4, 5, 6, 0.5);
    expect(c.startX).toBe(1);
    expect(c.startY).toBe(2);
    expect(c.startZ).toBe(3);
    expect(c.endX).toBe(4);
    expect(c.endY).toBe(5);
    expect(c.endZ).toBe(6);
    expect(c.radius).toBe(0.5);
  });
});

describe('getClosestPointOnCapsule', () => {
  it('returns the nearest surface point for a point off the side', () => {
    // Vertical capsule along Y axis from (0,-1,0) to (0,1,0) with radius 1.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    const out = createVector3();
    // Point at (5, 0, 0): closest axis point is (0,0,0), surface is (1,0,0).
    getClosestPointOnCapsule(out, c, createVector3(5, 0, 0));
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('returns the start cap surface for a point beyond the start', () => {
    const c = createCapsule(0, 0, 0, 0, 2, 0, 1);
    const out = createVector3();
    // Point at (0,-5,0): closest axis point is (0,0,0) (clamped start), surface is (0,-1,0).
    getClosestPointOnCapsule(out, c, createVector3(0, -5, 0));
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(-1, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('returns the end cap surface for a point beyond the end', () => {
    const c = createCapsule(0, 0, 0, 0, 2, 0, 1);
    const out = createVector3();
    // Point at (0,10,0): closest axis point is (0,2,0) (clamped end), surface is (0,3,0).
    getClosestPointOnCapsule(out, c, createVector3(0, 10, 0));
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(3, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });

  it('supports out === point', () => {
    const c = createCapsule(0, 0, 0, 0, 0, 0, 1);
    const p = createVector3(5, 0, 0);
    getClosestPointOnCapsule(p, c, p);
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });
});

describe('intersectRay3DCapsule', () => {
  it('hits a unit capsule from the side', () => {
    // Capsule from (0,-1,0) to (0,1,0) with radius 1.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    // Ray from (5,0,0) pointing in -X: should enter at x=1, t=4.
    const ray = createRay3D(5, 0, 0, -1, 0, 0);
    const t = intersectRay3DCapsule(ray, c);
    expect(t).toBeCloseTo(4, 5);
  });

  it('returns -1 for a ray pointing away from the capsule', () => {
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    const ray = createRay3D(5, 0, 0, 1, 0, 0);
    expect(intersectRay3DCapsule(ray, c)).toBe(-1);
  });

  it('returns 0 for a ray starting inside the capsule', () => {
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    const ray = createRay3D(0, 0, 0, 1, 0, 0);
    expect(intersectRay3DCapsule(ray, c)).toBe(0);
  });

  it('hits the end cap from above', () => {
    // Capsule from (0,0,0) to (0,0,0) (degenerate sphere) with radius 1, hit from +Y.
    const c = createCapsule(0, 0, 0, 0, 0, 0, 1);
    const ray = createRay3D(0, 5, 0, 0, -1, 0);
    const t = intersectRay3DCapsule(ray, c);
    expect(t).toBeCloseTo(4, 5);
  });
});

describe('isCapsuleIntersectingCapsule', () => {
  it('returns true for two overlapping capsules', () => {
    const a = createCapsule(0, 0, 0, 0, 2, 0, 1);
    const b = createCapsule(1, 0, 0, 1, 2, 0, 1);
    expect(isCapsuleIntersectingCapsule(a, b)).toBe(true);
  });

  it('returns false for two separated capsules', () => {
    const a = createCapsule(0, 0, 0, 0, 2, 0, 0.5);
    const b = createCapsule(10, 0, 0, 10, 2, 0, 0.5);
    expect(isCapsuleIntersectingCapsule(a, b)).toBe(false);
  });

  it('returns false if either capsule has a negative radius', () => {
    const a = createCapsule(0, 0, 0, 0, 2, 0, 1);
    const empty = createCapsule(0, 0, 0, 0, 2, 0, -1);
    expect(isCapsuleIntersectingCapsule(a, empty)).toBe(false);
    expect(isCapsuleIntersectingCapsule(empty, a)).toBe(false);
  });
});

describe('isCapsuleIntersectingSphere', () => {
  it('returns true when the sphere overlaps the capsule', () => {
    const c = createCapsule(0, -2, 0, 0, 2, 0, 1);
    const s = createBoundingSphere(2, 0, 0, 1);
    expect(isCapsuleIntersectingSphere(c, s)).toBe(true);
  });

  it('returns false when the sphere is separated from the capsule', () => {
    const c = createCapsule(0, -2, 0, 0, 2, 0, 1);
    const s = createBoundingSphere(10, 0, 0, 1);
    expect(isCapsuleIntersectingSphere(c, s)).toBe(false);
  });

  it('returns false if the sphere radius is negative', () => {
    const c = createCapsule(0, -2, 0, 0, 2, 0, 1);
    const empty = createBoundingSphere(0, 0, 0, -1);
    expect(isCapsuleIntersectingSphere(c, empty)).toBe(false);
  });

  it('returns false if the capsule radius is negative', () => {
    const c = createCapsule(0, -2, 0, 0, 2, 0, -1);
    const s = createBoundingSphere(0, 0, 0, 1);
    expect(isCapsuleIntersectingSphere(c, s)).toBe(false);
  });
});

describe('setCapsule', () => {
  it('updates all fields in place', () => {
    const c = createCapsule(0, 0, 0, 0, 0, 0, 0);
    setCapsule(c, 1, 2, 3, 4, 5, 6, 7);
    expect(c.startX).toBe(1);
    expect(c.startY).toBe(2);
    expect(c.startZ).toBe(3);
    expect(c.endX).toBe(4);
    expect(c.endY).toBe(5);
    expect(c.endZ).toBe(6);
    expect(c.radius).toBe(7);
  });
});
