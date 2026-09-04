import type { CollisionRaycastHit2D, CollisionBuiltInShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getCollisionShapeContainsPoint2D } from './pointContainment2D';
import {
  createCollisionRaycastHit2D,
  initializeCollisionRaycastHit2D,
  raycastCollisionShape2D,
} from './raycastCollisionShape2D';

function hit(): CollisionRaycastHit2D {
  return createCollisionRaycastHit2D();
}

describe('createCollisionRaycastHit2D', () => {
  it('starts in the reusable miss state', () => {
    expect(createCollisionRaycastHit2D()).toMatchObject({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });
});

describe('initializeCollisionRaycastHit2D', () => {
  it('is the construction initializer of createCollisionRaycastHit2D', () => {
    expect(typeof initializeCollisionRaycastHit2D).toBe('function');
  });
});
describe('raycastCollisionShape2D', () => {
  it('keeps polygon center state isolated from a nested raycast triggered by a point getter', () => {
    const points = [2, -1, 4, -1, 4, 1, 2, 1];
    let armed = false;
    let nestedCalls = 0;
    Object.defineProperty(points, 0, {
      configurable: true,
      get() {
        if (armed) {
          armed = false;
          nestedCalls++;
          raycastCollisionShape2D(
            { kind: 'polygon', points: [-102, -1, -100, -1, -100, 1, -102, 1] },
            0,
            0,
            1,
            0,
            hit(),
          );
        }
        return 2;
      },
    });
    Object.defineProperty(points, 7, {
      configurable: true,
      get() {
        armed = true;
        return 1;
      },
    });

    const out = hit();
    expect(raycastCollisionShape2D({ kind: 'polygon', points }, 0, 0, 1, 0, out)).toBe(true);
    expect(nestedCalls).toBeGreaterThan(0);
    expect(out.fraction).toBeCloseTo(2);
    expect(out.normalX).toBeCloseTo(-1);
    expect(out.normalY).toBeCloseTo(0);
  });

  it.each([
    ['circle', { kind: 'circle', x: 3, y: 0, radius: 1 }, 2, -1, 0],
    ['aabb', { kind: 'aabb', minX: 2, minY: -1, maxX: 4, maxY: 1 }, 2, -1, 0],
    ['obb', { kind: 'obb', x: 3, y: 0, halfW: 1, halfH: 1, rotation: 0 }, 2, -1, 0],
    ['polygon', { kind: 'polygon', points: [2, -1, 4, -1, 4, 1, 2, 1] }, 2, -1, 0],
    ['segment', { kind: 'segment', x0: 2, y0: -1, x1: 2, y1: 1 }, 2, -1, 0],
    ['point', { kind: 'point', x: 2, y: 0 }, 2, 0, 0],
  ] as const)('hits a %s at its first exact fraction', (_name, shape, fraction, normalX, normalY) => {
    const out = hit();
    expect(raycastCollisionShape2D(shape as CollisionBuiltInShape2D, 0, 0, 1, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(fraction);
    expect(out.x).toBeCloseTo(fraction);
    expect(out.y).toBeCloseTo(0);
    expect(out.normalX).toBeCloseTo(normalX);
    expect(out.normalY).toBeCloseTo(normalY);
  });

  it('rotates an oriented-box hit normal back to world space', () => {
    const out = hit();
    const shape: CollisionBuiltInShape2D = { kind: 'obb', x: 3, y: 0, halfW: 1, halfH: 0.5, rotation: Math.PI / 4 };
    expect(raycastCollisionShape2D(shape, 0, 0, 1, 0, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(out.normalY).toBeCloseTo(Math.SQRT1_2);
  });

  it('reports an origin inside a shape at fraction zero with no entry normal', () => {
    const out = hit();
    expect(raycastCollisionShape2D({ kind: 'circle', x: 0, y: 0, radius: 2 }, 0, 0, 1, 0, out)).toBe(true);
    expect(out).toMatchObject({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });

  it('honours maxFraction and clears output on a miss', () => {
    const out = hit();
    out.fraction = 9;
    out.x = 9;
    out.y = 9;
    out.normalX = 9;
    out.normalY = 9;
    expect(raycastCollisionShape2D({ kind: 'circle', x: 3, y: 0, radius: 1 }, 0, 0, 1, 0, out, 1)).toBe(false);
    expect({ fraction: out.fraction, x: out.x, y: out.y, normalX: out.normalX, normalY: out.normalY }).toMatchObject({
      fraction: 0,
      x: 0,
      y: 0,
      normalX: 0,
      normalY: 0,
    });
  });

  it('treats a zero direction as an exact point query', () => {
    const out = hit();
    expect(raycastCollisionShape2D({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0, 0, 0, 0, out)).toBe(true);
    expect(raycastCollisionShape2D({ kind: 'aabb', minX: 2, minY: 2, maxX: 3, maxY: 3 }, 0, 0, 0, 0, out)).toBe(false);
  });

  it('keeps point-ray tolerance invariant when direction is rescaled', () => {
    const shape: CollisionBuiltInShape2D = { kind: 'point', x: 2, y: 1e-6 };
    expect(raycastCollisionShape2D(shape, 0, 0, 1, 0, hit())).toBe(false);
    expect(raycastCollisionShape2D(shape, 0, 0, 1e6, 0, hit())).toBe(false);
  });

  // The instrument is the CONTAINMENT predicate, marched along the ray in small steps. It shares no
  // algebra with the raycast — a different function, a different derivation — so agreement is evidence.
  // This is the shape of test that caught the 3D cylinder's inverted cap normal, which no unit test had.
  it('agrees with a brute-force containment march over a seeded sweep of capsules', () => {
    let state = 20260821;
    const next = (): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 100000) / 100000;
    };

    const out = hit();
    const SAMPLES = 40000;
    let compared = 0;
    let worstFraction = 0;

    for (let trial = 0; trial < 700; trial++) {
      const capsule: CollisionBuiltInShape2D = {
        kind: 'capsule',
        x0: (next() - 0.5) * 6,
        y0: (next() - 0.5) * 6,
        x1: (next() - 0.5) * 6,
        y1: (next() - 0.5) * 6,
        radius: 0.2 + next() * 1.5,
      };
      const originX = (next() - 0.5) * 20;
      const originY = (next() - 0.5) * 20;
      // Aimed near the capsule so most trials are real hits, with enough scatter to produce grazes.
      const directionX = (capsule.x0 + capsule.x1) / 2 + (next() - 0.5) * 6 - originX;
      const directionY = (capsule.y0 + capsule.y1) / 2 + (next() - 0.5) * 6 - originY;
      if (getCollisionShapeContainsPoint2D(capsule, originX, originY)) continue;

      // Bounded at 1 so the march, which walks fractions 0..1, is asked the same question. Left
      // unbounded, the raycast legitimately reports hits past the end of the marched interval and the
      // instrument reads its own blind spot as a defect.
      const found = raycastCollisionShape2D(capsule, originX, originY, directionX, directionY, out, 1);

      let marched = -1;
      for (let sample = 0; sample <= SAMPLES; sample++) {
        const fraction = sample / SAMPLES;
        if (
          getCollisionShapeContainsPoint2D(capsule, originX + directionX * fraction, originY + directionY * fraction)
        ) {
          marched = fraction;
          break;
        }
      }

      expect(found, `trial ${String(trial)} hit/miss`).toBe(marched >= 0);
      if (!found) continue;
      compared++;
      worstFraction = Math.max(worstFraction, Math.abs(out.fraction - marched));

      // Stepping OUT along the reported normal must leave the capsule and stepping IN must stay inside,
      // which pins the normal's direction without recomputing it.
      expect(
        getCollisionShapeContainsPoint2D(capsule, out.x + out.normalX * 1e-4, out.y + out.normalY * 1e-4),
        `trial ${String(trial)} normal points outward`,
      ).toBe(false);
      expect(
        getCollisionShapeContainsPoint2D(capsule, out.x - out.normalX * 1e-4, out.y - out.normalY * 1e-4),
        `trial ${String(trial)} normal points inward`,
      ).toBe(true);
    }

    expect(compared).toBeGreaterThan(200);
    // One march increment, which is all a sampled instrument can resolve.
    expect(worstFraction).toBeLessThan(2 / SAMPLES);
  });
});
