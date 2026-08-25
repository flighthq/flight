import {
  createAabb,
  createBoundingSphere,
  createCapsule,
  createRay3D,
  createVector3,
  getClosestPointOnCapsule,
  intersectRay3DCapsule,
  isCapsuleIntersectingAabb,
  isCapsuleIntersectingCapsule,
  isCapsuleIntersectingSphere,
  setCapsule,
} from '@flighthq/geometry/contract';

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

  it('answers a point on the axis with a surface point, whichever way the axis runs', () => {
    // A point on the axis has no single nearest surface point, so the answer is a pick from the
    // ring around it — but it still has to be a point on the surface. Each capsule below is
    // centered on the origin and queried at the origin, so a correct answer sits one radius out
    // and square to the axis; an answer pointing along the axis is inside the capsule, not on it.
    const out = createVector3();

    getClosestPointOnCapsule(out, createCapsule(-5, 0, 0, 5, 0, 0, 1), createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 5);
    expect(out.x).toBeCloseTo(0, 5);

    getClosestPointOnCapsule(out, createCapsule(0, -5, 0, 0, 5, 0, 1), createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);

    getClosestPointOnCapsule(out, createCapsule(0, 0, -5, 0, 0, 5, 1), createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 5);
    expect(out.z).toBeCloseTo(0, 5);

    // A capsule with no length is a sphere: its center has a whole sphere of nearest points and
    // every direction is square to a zero-length axis, so only the distance is fixed.
    getClosestPointOnCapsule(out, createCapsule(0, 0, 0, 0, 0, 0, 1), createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 5);
  });

  it('answers a point on a diagonal axis with a surface point too', () => {
    // The axis here lines up with no world direction, so the perpendicular is a genuine cross
    // product rather than a swap of coordinates. A correct answer is one radius from the axis
    // point, which for a query at the middle of a centered capsule means square to the axis.
    const evenlyDiagonal = createCapsule(-3, -3, -3, 3, 3, 3, 2);
    const out = createVector3();
    getClosestPointOnCapsule(out, evenlyDiagonal, createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(2, 5);
    expect(out.x + out.y + out.z).toBeCloseTo(0, 5);

    // An axis leaning mostly along x, least along z, so the direction it is crossed with differs
    // again — every ordering of the axis components has to produce a perpendicular.
    const leaningDiagonal = createCapsule(-3, -2, -1, 3, 2, 1, 2);
    getClosestPointOnCapsule(out, leaningDiagonal, createVector3(0, 0, 0));
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(2, 5);
    expect(out.x * 3 + out.y * 2 + out.z * 1).toBeCloseTo(0, 5);
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

  it('returns -1 for a ray with no direction', () => {
    // Matches intersectRay3DSphere: a zero-length direction is not a ray and never hits, even
    // from a point inside the capsule.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(0, 0, 0, 0, 0, 0), c)).toBe(-1);
    expect(intersectRay3DCapsule(createRay3D(9, 9, 9, 0, 0, 0), c)).toBe(-1);
  });

  it('returns -1 for an empty capsule with a negative radius', () => {
    const empty = createCapsule(0, -1, 0, 0, 1, 0, -1);
    expect(intersectRay3DCapsule(createRay3D(5, 0, 0, -1, 0, 0), empty)).toBe(-1);
  });

  it('returns -1 for a ray that passes wide of the capsule', () => {
    // Parallel to nothing and outside the cylinder radius, so neither the body nor either cap has
    // a real intersection at all — a different miss from a ray aimed away from a capsule in reach.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(5, 0, 5, -1, 0, 0), c)).toBe(-1);
  });

  it('hits a cap when the ray runs along the capsule axis', () => {
    // Straight down the axis the body test has nothing to solve — the ray never crosses the
    // cylinder wall — so the answer has to come from the cap.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(0, 5, 0, 0, -1, 0), c)).toBeCloseTo(3, 5);
  });

  it('returns 0 for a ray starting inside a cap and pointing away', () => {
    // Inside the rounded end, heading out. The near root of the cap sphere is behind the origin
    // and the far one ahead, which is the definition of starting inside.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(0, 1.5, 0, 0, 1, 0), c)).toBe(0);
  });

  it('falls back to a cap when the body hit lands past the end of the axis', () => {
    // These rays cross the infinite cylinder, but above or below the segment the cylinder is not
    // capsule any more, so the body hit must be discarded and the rounded end answered instead.
    // The capsule spans y in [-1, 1] with radius 1; a ray at y = 1.8 crosses the end sphere at
    // x = sqrt(1 - 0.8^2) = 0.6, so it enters 4.4 along from x = 5.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(5, 1.8, 0, -1, 0, 0), c)).toBeCloseTo(4.4, 5);
    expect(intersectRay3DCapsule(createRay3D(5, -1.8, 0, -1, 0, 0), c)).toBeCloseTo(4.4, 5);

    // Beyond the reach of the cap, the same arrangement is a clean miss.
    expect(intersectRay3DCapsule(createRay3D(5, 2.5, 0, -1, 0, 0), c)).toBe(-1);
  });

  it('returns -1 from inside the infinite cylinder but past the end cap', () => {
    // The origin is in line with the capsule body yet beyond its end, so being inside the endless
    // cylinder means nothing: from a point outside the capsule heading away, there is no hit.
    const c = createCapsule(0, -1, 0, 0, 1, 0, 1);
    expect(intersectRay3DCapsule(createRay3D(0, 3, 0, 1, 1, 0), c)).toBe(-1);
  });
});

describe('isCapsuleIntersectingAabb', () => {
  it('returns true when the capsule segment passes through the AABB', () => {
    const capsule = createCapsule(-5, 0, 0, 5, 0, 0, 0.5);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isCapsuleIntersectingAabb(capsule, aabb)).toBe(true);
  });

  it('returns true when the capsule radius reaches the AABB', () => {
    const capsule = createCapsule(0, 2, 0, 0, 2, 0, 1.5);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isCapsuleIntersectingAabb(capsule, aabb)).toBe(true);
  });

  it('returns false when the capsule is far from the AABB', () => {
    const capsule = createCapsule(10, 10, 10, 10, 12, 10, 0.5);
    const aabb = createAabb(-1, -1, -1, 1, 1, 1);
    expect(isCapsuleIntersectingAabb(capsule, aabb)).toBe(false);
  });

  it('returns false for a negative-radius capsule', () => {
    const capsule = createCapsule(0, 0, 0, 0, 0, 0, -1);
    const aabb = createAabb(-10, -10, -10, 10, 10, 10);
    expect(isCapsuleIntersectingAabb(capsule, aabb)).toBe(false);
  });

  it('returns false for an empty AABB', () => {
    const capsule = createCapsule(0, 0, 0, 1, 0, 0, 5);
    const aabb = createAabb(1, 0, 0, 0, 1, 1);
    expect(isCapsuleIntersectingAabb(capsule, aabb)).toBe(false);
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

  it('switches over at the true axis distance for every segment arrangement', () => {
    // The segment-to-segment distance behind this test has a separate branch for each way two
    // segments can be arranged — both degenerate to points, one degenerate, parallel, skew, and
    // the two cases where the nearest approach falls beyond an endpoint of the second segment.
    // Each is checked against a distance measured by walking both segments, so a branch that
    // returns the wrong closest pair shows up as an answer that flips at the wrong radius.
    const arrangements: Array<[string, readonly number[], readonly number[]]> = [
      ['two points', [1, 2, 3, 1, 2, 3], [4, 6, 3, 4, 6, 3]],
      ['point and segment', [0, 5, 0, 0, 5, 0], [-10, 0, 0, 10, 0, 0]],
      ['segment and point', [-10, 0, 0, 10, 0, 0], [0, 5, 0, 0, 5, 0]],
      ['parallel', [0, 0, 0, 0, 10, 0], [3, 0, 0, 3, 10, 0]],
      ['skew, nearest approach inside both', [-5, 0, 0, 5, 0, 0], [0, -5, 2, 0, 5, 2]],
      ['nearest approach before the second start', [0, 0, 0, 10, 0, 0], [5, 5, 3, 5, 15, 3]],
      ['nearest approach past the second end', [0, 0, 0, 10, 0, 0], [5, -15, 3, 5, -5, 3]],
    ];

    for (const [name, first, second] of arrangements) {
      const gap = measureSegmentDistance(first, second);
      const tooShort = createCapsule(...(first as SegmentArguments), gap * 0.45);
      const longEnough = createCapsule(...(first as SegmentArguments), gap * 0.55);
      const reach = createCapsule(...(second as SegmentArguments), gap * 0.45);

      expect([name, isCapsuleIntersectingCapsule(tooShort, reach)]).toEqual([name, false]);
      expect([name, isCapsuleIntersectingCapsule(longEnough, reach)]).toEqual([name, true]);
    }
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

  it('treats a capsule with no length as a sphere', () => {
    // Both endpoints in the same place leaves no axis to project onto, and the test reduces to
    // two spheres: they touch when the centers are closer than the radii add up to.
    const point = createCapsule(0, 0, 0, 0, 0, 0, 1);
    expect(isCapsuleIntersectingSphere(point, createBoundingSphere(2.5, 0, 0, 1))).toBe(false);
    expect(isCapsuleIntersectingSphere(point, createBoundingSphere(1.5, 0, 0, 1))).toBe(true);
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

// The six coordinates of a capsule axis: start x, y, z then end x, y, z.
type SegmentArguments = [number, number, number, number, number, number];

// The smallest distance between two segments, found by walking both of them. Deliberately not the
// closed-form solution the source uses — it is slow and approximate, but it is arrived at
// independently, so it can disagree with the formula it checks.
function measureSegmentDistance(first: readonly number[], second: readonly number[]): number {
  const steps = 600;
  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const px = first[0] + s * (first[3] - first[0]);
    const py = first[1] + s * (first[4] - first[1]);
    const pz = first[2] + s * (first[5] - first[2]);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const qx = second[0] + t * (second[3] - second[0]);
      const qy = second[1] + t * (second[4] - second[1]);
      const qz = second[2] + t * (second[5] - second[2]);
      const distance = Math.hypot(px - qx, py - qy, pz - qz);
      if (distance < smallest) smallest = distance;
    }
  }
  return smallest;
}
