import type { CollisionShape2D } from '@flighthq/types/contract';

import { registerBuiltInCollisionSupports2D } from './collisionSupport2D';
import { testCollisionSupport2D, testCollisionSupportOverlap2D } from './gjk2D';
import { createCollisionManifold2D } from './manifold';
import { testCollision2D } from './testCollision2D';

registerBuiltInCollisionSupports2D();

describe('testCollisionSupport2D', () => {
  it('agrees with every incumbent SAT pair, on overlap and on the manifold itself', () => {
    // The differential test the collision charter sequences this work behind: ten hand-written pair
    // functions already encode years of degeneracy and orientation decisions, so the generic core is
    // measured against them rather than against a fresh set of expectations that could be wrong the
    // same way it is.
    const random = createSeededRandom(0x5eed);
    const generic = createCollisionManifold2D();
    const incumbent = createCollisionManifold2D();
    let overlaps = 0;
    let trials = 0;
    let grazing = 0;
    let opposed = 0;

    for (let i = 0; i < 4000; i += 1) {
      const a = createRandomShape(random);
      const b = createRandomShape(random);
      trials += 1;

      const genericOverlapping = testCollisionSupport2D(a, b, generic);
      const incumbentOverlapping = testCollision2D(a, b, incumbent);

      // A pair within a hair of exactly touching is where an iterative method and an analytic one are
      // entitled to disagree, and asserting they do not would be asserting something neither promises:
      // GJK stops when a support point fails to reach past the origin, SAT compares an overlap against
      // zero, and at a penetration of 1e-9 those are different questions. Skipped and counted rather
      // than silently tolerated, so the count itself is evidence the boundary is narrow.
      if (
        (genericOverlapping && generic.depth < GRAZING_DEPTH) ||
        (incumbentOverlapping && incumbent.depth < GRAZING_DEPTH)
      ) {
        grazing += 1;
        continue;
      }

      expect({ i, overlapping: genericOverlapping }).toEqual({ i, overlapping: incumbentOverlapping });
      if (!genericOverlapping) continue;

      overlaps += 1;
      // Depth first: a normal is only meaningful alongside the distance it carries, and a wrong depth
      // with a right normal is the failure a solver turns into a body sinking or launching. This is the
      // strong claim, and it holds to 1e-5 across every pair.
      expect(generic.depth).toBeCloseTo(incumbent.depth, 5);

      // The normal is checked as an AXIS, and its SIGN is counted rather than asserted. Two separate
      // and known gaps, both measured rather than assumed:
      //
      //   * On a curved boundary EPA terminates on a distance, and distance is second-order
      //     insensitive to angular error — a depth converged to 1e-10 still leaves a circle's normal a
      //     few parts in a thousand out on a deep overlap.
      //   * When the minimum translation is the SAME both ways, which way is "out" is a genuine tie.
      //     The incumbent breaks it with named machinery (`canonicalizeScratchAxis` and the
      //     lexicographic preference in `isPreferredAxis`); the generic core does not yet, so it can
      //     pick the opposite direction with an identical depth.
      //
      // The second is why this core is not yet wired in as the default fallback: a solver acts on the
      // sign, and pushing bodies the wrong way is not a rounding difference.
      const alignment = generic.normalX * incumbent.normalX + generic.normalY * incumbent.normalY;
      expect(Math.abs(alignment)).toBeCloseTo(1, 2);
      if (alignment < 0) opposed += 1;
    }

    // A differential test that never overlapped would pass while proving nothing.
    expect(overlaps).toBeGreaterThan(trials / 10);
    // The tie-break gap, pinned to the size it is measured at today. It exists to fail if it grows —
    // an untracked "known difference" is how a real regression gets absorbed into an exemption.
    expect(opposed).toBeLessThan(overlaps / 100);
    // And the skipped boundary band has to stay a band. If this ever climbs, the two methods are
    // disagreeing about ordinary overlaps and hiding behind the exemption.
    expect(grazing).toBeLessThan(trials / 200);
  });

  it('orients the normal to push A out of B', () => {
    const out = createCollisionManifold2D();
    const a: CollisionShape2D = { kind: 'circle', radius: 1, x: 0, y: 0 };
    const b: CollisionShape2D = { kind: 'circle', radius: 1, x: 1.5, y: 0 };

    expect(testCollisionSupport2D(a, b, out)).toBe(true);

    // A is left of B, so separating A means moving it further left. The depth is exact to 1e-9; the
    // direction is a circle's, so it is held to the accuracy EPA can actually reach.
    expect(out.normalX).toBeCloseTo(-1, 4);
    expect(out.normalY).toBeCloseTo(0, 4);
    expect(out.depth).toBeCloseTo(0.5, 9);
  });

  it('reverses the normal when the arguments are reversed', () => {
    const forward = createCollisionManifold2D();
    const reverse = createCollisionManifold2D();
    const a: CollisionShape2D = { kind: 'aabb', maxX: 1, maxY: 1, minX: -1, minY: -1 };
    const b: CollisionShape2D = { kind: 'aabb', maxX: 2.5, maxY: 1, minX: 0.5, minY: -1 };

    testCollisionSupport2D(a, b, forward);
    testCollisionSupport2D(b, a, reverse);

    expect(reverse.normalX).toBeCloseTo(-forward.normalX, 9);
    expect(reverse.normalY).toBeCloseTo(-forward.normalY, 9);
    expect(reverse.depth).toBeCloseTo(forward.depth, 9);
  });

  it('reports a clear manifold for a kind with no registered support', () => {
    const out = createCollisionManifold2D();
    out.overlapping = true;
    out.depth = 5;

    // A point is INSIDE the circle, and is refused anyway: area-less kinds are deliberately absent
    // from the support registry, because a penetration depth against one means nothing.
    const overlapping = testCollisionSupport2D(
      { kind: 'point', x: 0, y: 0 },
      { kind: 'circle', radius: 1, x: 0, y: 0 },
      out,
    );

    expect(overlapping).toBe(false);
    expect(out.overlapping).toBe(false);
    expect(out.depth).toBe(0);
  });

  it('treats a pair that only touches as not overlapping', () => {
    const out = createCollisionManifold2D();

    const overlapping = testCollisionSupport2D(
      { kind: 'circle', radius: 1, x: 0, y: 0 },
      { kind: 'circle', radius: 1, x: 2, y: 0 },
      out,
    );

    expect(overlapping).toBe(false);
  });

  it('takes the shallow axis out of a pair that overlaps on both', () => {
    const out = createCollisionManifold2D();
    // Overlapping by 0.2 vertically and by 3 horizontally. The minimum translation is the SHALLOW one,
    // which is what makes a manifold usable: separating along the deep axis would shove a body across
    // the room to resolve a graze.
    testCollisionSupport2D(
      { kind: 'aabb', maxX: 2, maxY: 1, minX: -2, minY: -1 },
      { kind: 'aabb', maxX: 1, maxY: 3, minX: -1, minY: 0.8 },
      out,
    );

    expect(Math.abs(out.normalX)).toBeCloseTo(0, 6);
    expect(out.normalY).toBeCloseTo(-1, 6);
    expect(out.depth).toBeCloseTo(0.2, 6);
  });
});

describe('testCollisionSupportOverlap2D', () => {
  it('agrees with the manifold path about whether a pair overlaps', () => {
    const random = createSeededRandom(0xc0ffee);
    const out = createCollisionManifold2D();

    for (let i = 0; i < 1000; i += 1) {
      const a = createRandomShape(random);
      const b = createRandomShape(random);
      expect({ i, overlapping: testCollisionSupportOverlap2D(a, b) }).toEqual({
        i,
        overlapping: testCollisionSupport2D(a, b, out),
      });
    }
  });

  it('returns false for an unregistered kind rather than throwing', () => {
    expect(
      testCollisionSupportOverlap2D({ kind: 'acme.capsule' } as unknown as CollisionShape2D, {
        kind: 'circle',
        radius: 1,
        x: 0,
        y: 0,
      }),
    ).toBe(false);
  });
});

// Below this penetration the pair is grazing, and the two methods answer different questions.
const GRAZING_DEPTH = 1e-6;

// A small deterministic generator. Reproducibility is the point: a differential test that shuffles
// differently each run reports a failure nobody can reproduce from the output.
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createRandomShape(random: () => number): CollisionShape2D {
  const spread = 4;
  const x = (random() - 0.5) * spread;
  const y = (random() - 0.5) * spread;
  switch (Math.floor(random() * 4)) {
    case 0:
      return { kind: 'circle', radius: 0.25 + random() * 1.25, x, y };
    case 1: {
      const halfW = 0.25 + random() * 1.25;
      const halfH = 0.25 + random() * 1.25;
      return { kind: 'aabb', maxX: x + halfW, maxY: y + halfH, minX: x - halfW, minY: y - halfH };
    }
    case 2:
      return {
        halfH: 0.25 + random() * 1.25,
        halfW: 0.25 + random() * 1.25,
        kind: 'obb',
        rotation: random() * Math.PI * 2,
        x,
        y,
      };
    default: {
      // A convex polygon by construction: vertices on an ellipse at angles that advance by random but
      // strictly positive steps summing to EXACTLY one turn.
      //
      // Normalizing the steps is the whole trick, and skipping it is a real trap — stepping by a random
      // multiple of `2*pi/count` lets the total overshoot 2*pi, so the last vertices wrap past the first
      // and the polygon self-intersects. The incumbent documents that it does not answer for a
      // non-convex polygon, so every such shape becomes a mismatch that looks exactly like a solver bug.
      const radiusX = 0.3 + random() * 1.2;
      const radiusY = 0.3 + random() * 1.2;
      const count = 3 + Math.floor(random() * 4);
      const steps: number[] = [];
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        const step = 0.4 + random();
        steps.push(step);
        total += step;
      }
      const points: number[] = [];
      let angle = random() * Math.PI * 2;
      for (let i = 0; i < count; i += 1) {
        points.push(x + Math.cos(angle) * radiusX, y + Math.sin(angle) * radiusY);
        angle += (steps[i] / total) * Math.PI * 2;
      }
      return { kind: 'polygon', points };
    }
  }
}
