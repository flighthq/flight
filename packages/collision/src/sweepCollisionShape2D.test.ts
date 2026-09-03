import type { CollisionBuiltInShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collideContactManifold2D } from './collideContactManifold2D';
import { createCollisionContactManifold2D } from './contactManifold2D';
import { createCollisionTimeOfImpact2D, sweepCollisionShape2D } from './sweepCollisionShape2D';

type CollisionCapsule2D = Extract<CollisionBuiltInShape2D, { kind: 'capsule' }>;
type CollisionSweepTarget2D = Extract<CollisionBuiltInShape2D, { kind: 'aabb' | 'capsule' | 'circle' | 'obb' }>;

const SEEDED_CAPSULE_SWEEP_BATCHES = [
  { endTrial: 300, startTrial: 0 },
  { endTrial: 600, startTrial: 300 },
  { endTrial: 900, startTrial: 600 },
  { endTrial: 1200, startTrial: 900 },
] as const;

describe('createCollisionTimeOfImpact2D', () => {
  it('creates a cleared reusable output record', () => {
    expect(createCollisionTimeOfImpact2D()).toMatchObject({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });
});

describe('sweepCollisionShape2D', () => {
  it('keeps continuous-SAT state isolated from a nested sweep triggered by the output setter', () => {
    const out = createCollisionTimeOfImpact2D();
    let fraction = 0;
    let fractionWrites = 0;
    let nestedCalls = 0;
    Object.defineProperty(out, 'fraction', {
      configurable: true,
      enumerable: true,
      get: () => fraction,
      set(value: number) {
        fraction = value;
        fractionWrites++;
        if (fractionWrites !== 2) return;
        nestedCalls++;
        sweepCollisionShape2D(
          { kind: 'aabb', minX: -1, minY: 0, maxX: 1, maxY: 2 },
          0,
          10,
          { kind: 'aabb', minX: -1, minY: 5, maxX: 1, maxY: 7 },
          0,
          0,
          createCollisionTimeOfImpact2D(),
        );
      },
    });

    expect(
      sweepCollisionShape2D(
        { kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0 },
        10,
        0,
        { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 },
        0,
        0,
        out,
      ),
    ).toBe(true);
    expect(nestedCalls).toBe(1);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(-1);
    expect(out.normalY).toBe(0);
  });

  it('finds the exact circle-circle root under relative motion', () => {
    const out = createCollisionTimeOfImpact2D();
    expect(
      sweepCollisionShape2D(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        10,
        0,
        { kind: 'circle', x: 6, y: 0, radius: 1 },
        2,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBeCloseTo(0.5);
    expect(out.normalX).toBe(-1);
    expect(out.x).toBeCloseTo(6);
  });

  it('sweeps a circle exactly against polygon faces and rounded corners', () => {
    const box = { kind: 'aabb', minX: 5, minY: 5, maxX: 7, maxY: 7 } as const;
    const face = createCollisionTimeOfImpact2D();
    expect(sweepCollisionShape2D({ kind: 'circle', x: 0, y: 6, radius: 1 }, 10, 0, box, 0, 0, face)).toBe(true);
    expect(face.fraction).toBeCloseTo(0.4);
    expect([face.normalX, face.normalY]).toEqual([-1, 0]);

    const corner = createCollisionTimeOfImpact2D();
    expect(sweepCollisionShape2D({ kind: 'circle', x: 0, y: 0, radius: 1 }, 10, 10, box, 0, 0, corner)).toBe(true);
    expect(corner.fraction).toBeCloseTo((5 - Math.SQRT1_2) / 10);
    expect(corner.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(corner.normalY).toBeCloseTo(-Math.SQRT1_2);
  });

  it('reverses the normal when the polygon is shape A and still writes a point on A', () => {
    const out = createCollisionTimeOfImpact2D();
    expect(
      sweepCollisionShape2D(
        { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 },
        0,
        0,
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        10,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(1);
    expect(out.x).toBe(5);
  });

  it('uses continuous SAT for polygon pairs and honours maxFraction', () => {
    const moving = { kind: 'obb', x: 0, y: 0, halfW: 1, halfH: 1, rotation: 0 } as const;
    const fixed = { kind: 'aabb', minX: 5, minY: -1, maxX: 7, maxY: 1 } as const;
    const out = createCollisionTimeOfImpact2D();

    expect(sweepCollisionShape2D(moving, 10, 0, fixed, 0, 0, out, 0.3)).toBe(false);
    expect(out).toMatchObject({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
    expect(sweepCollisionShape2D(moving, 10, 0, fixed, 0, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(0.4);
    expect(out.normalX).toBe(-1);
    expect(out.x).toBeCloseTo(5);
  });

  it('reports an initial overlap at zero and ignores a touching pair moving apart', () => {
    const out = createCollisionTimeOfImpact2D();
    expect(
      sweepCollisionShape2D(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        1,
        0,
        { kind: 'circle', x: 1, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(true);
    expect(out.fraction).toBe(0);
    expect(out.normalX).toBe(-1);

    expect(
      sweepCollisionShape2D(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        -1,
        0,
        { kind: 'circle', x: 2, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(false);
  });

  it('fails closed and clears reused output for unsupported or invalid input', () => {
    const out = createCollisionTimeOfImpact2D();
    sweepCollisionShape2D(
      { kind: 'circle', x: 0, y: 0, radius: 1 },
      10,
      0,
      { kind: 'circle', x: 5, y: 0, radius: 1 },
      0,
      0,
      out,
    );
    expect(
      sweepCollisionShape2D({ kind: 'point', x: 0, y: 0 }, 1, 0, { kind: 'circle', x: 2, y: 0, radius: 1 }, 0, 0, out),
    ).toBe(false);
    expect(out).toMatchObject({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
    expect(
      sweepCollisionShape2D(
        { kind: 'circle', x: 0, y: 0, radius: 1 },
        Number.NaN,
        0,
        { kind: 'circle', x: 2, y: 0, radius: 1 },
        0,
        0,
        out,
      ),
    ).toBe(false);
  });

  // The instrument is the DISCRETE manifold test, marched along the motion — a different function with a
  // different derivation, so agreement is evidence rather than restatement. Keep the original 1,200
  // trials, but divide their millions of manifold calls into independently timed batches: under the full
  // repository suite one monolithic test could exhaust Vitest's five-second allowance through contention.
  it.each(SEEDED_CAPSULE_SWEEP_BATCHES)(
    'agrees with a brute-force march of the discrete test over seeded capsule sweep trials $startTrial–$endTrial',
    ({ endTrial, startTrial }) => {
      let state = 987654321;
      const next = (): number => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 100000) / 100000;
      };
      const toi = createCollisionTimeOfImpact2D();
      const manifold = createCollisionContactManifold2D();
      const SAMPLES = 6000;
      let compared = 0;
      const comparedByKind: Record<CollisionSweepTarget2D['kind'], number> = { aabb: 0, capsule: 0, circle: 0, obb: 0 };
      let worst = 0;

      for (let trial = 0; trial < endTrial; trial++) {
        const capsule: CollisionCapsule2D = {
          kind: 'capsule',
          x0: (next() - 0.5) * 3,
          y0: (next() - 0.5) * 3,
          x1: (next() - 0.5) * 3,
          y1: (next() - 0.5) * 3,
          radius: 0.2 + next() * 0.8,
        };
        const pick = Math.floor(next() * 4);
        const cx = 5 + next() * 3;
        const cy = (next() - 0.5) * 4;
        const other: CollisionSweepTarget2D =
          pick === 0
            ? { kind: 'circle', x: cx, y: cy, radius: 0.3 + next() * 1.0 }
            : pick === 1
              ? { kind: 'aabb', minX: cx - 1, minY: cy - 0.8, maxX: cx + 1, maxY: cy + 0.8 }
              : pick === 2
                ? { kind: 'obb', x: cx, y: cy, halfW: 1, halfH: 0.6, rotation: next() * Math.PI }
                : {
                    kind: 'capsule',
                    x0: cx,
                    y0: cy,
                    x1: cx + (next() - 0.5) * 3,
                    y1: cy + (next() - 0.5) * 3,
                    radius: 0.2 + next() * 0.8,
                  };
        const dx = cx - (capsule.x0 + capsule.x1) / 2 + (next() - 0.5) * 2;
        const dy = cy - (capsule.y0 + capsule.y1) / 2 + (next() - 0.5) * 2;
        // Replaying only the random draws before this batch preserves the original seeded 1,200-case
        // sequence. Shape generation is cheap; the discrete march below is the work that needs batching.
        if (trial < startTrial) continue;
        // Already-overlapping is a different question with its own arm above.
        if (collideContactManifold2D(capsule, other, manifold)) continue;

        const hit = sweepCollisionShape2D(capsule, dx, dy, other, 0, 0, toi);

        let marched = -1;
        // Reuse one probe shape for the millions of discrete samples. Allocation and GC are not part of
        // this differential instrument, so they should not add another source of full-suite contention.
        const marchedCapsule = { ...capsule };
        for (let sample = 0; sample <= SAMPLES; sample++) {
          const fraction = sample / SAMPLES;
          marchedCapsule.x0 = capsule.x0 + dx * fraction;
          marchedCapsule.y0 = capsule.y0 + dy * fraction;
          marchedCapsule.x1 = capsule.x1 + dx * fraction;
          marchedCapsule.y1 = capsule.y1 + dy * fraction;
          if (collideContactManifold2D(marchedCapsule, other, manifold)) {
            marched = fraction;
            break;
          }
        }

        // Both directions matter, and they are not symmetric in consequence: a sweep that misses an impact
        // the march finds is a bullet passing through a wall.
        expect(hit, `trial ${String(trial)} hit/miss`).toBe(marched >= 0);
        if (!hit) continue;
        compared++;
        comparedByKind[other.kind]++;
        worst = Math.max(worst, Math.abs(toi.fraction - marched));
      }

      expect(compared).toBeGreaterThan(250);
      for (const count of Object.values(comparedByKind)) expect(count).toBeGreaterThan(40);
      expect(worst).toBeLessThan(2 / SAMPLES);
    },
  );
});
