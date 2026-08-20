import type { CollisionRaycastHit2D, CollisionShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createCollisionRaycastHit2D, raycastCollisionShape2D } from './raycastCollisionShape2D';

function hit(): CollisionRaycastHit2D {
  return createCollisionRaycastHit2D();
}

describe('createCollisionRaycastHit2D', () => {
  it('starts in the reusable miss state', () => {
    expect(createCollisionRaycastHit2D()).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
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
    expect(raycastCollisionShape2D(shape as CollisionShape2D, 0, 0, 1, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(fraction);
    expect(out.x).toBeCloseTo(fraction);
    expect(out.y).toBeCloseTo(0);
    expect(out.normalX).toBeCloseTo(normalX);
    expect(out.normalY).toBeCloseTo(normalY);
  });

  it('rotates an oriented-box hit normal back to world space', () => {
    const out = hit();
    const shape: CollisionShape2D = { kind: 'obb', x: 3, y: 0, halfW: 1, halfH: 0.5, rotation: Math.PI / 4 };
    expect(raycastCollisionShape2D(shape, 0, 0, 1, 0, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(out.normalY).toBeCloseTo(Math.SQRT1_2);
  });

  it('reports an origin inside a shape at fraction zero with no entry normal', () => {
    const out = hit();
    expect(raycastCollisionShape2D({ kind: 'circle', x: 0, y: 0, radius: 2 }, 0, 0, 1, 0, out)).toBe(true);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });

  it('honours maxFraction and clears output on a miss', () => {
    const out = { fraction: 9, x: 9, y: 9, normalX: 9, normalY: 9 };
    expect(raycastCollisionShape2D({ kind: 'circle', x: 3, y: 0, radius: 1 }, 0, 0, 1, 0, out, 1)).toBe(false);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });

  it('treats a zero direction as an exact point query', () => {
    const out = hit();
    expect(raycastCollisionShape2D({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0, 0, 0, 0, out)).toBe(true);
    expect(raycastCollisionShape2D({ kind: 'aabb', minX: 2, minY: 2, maxX: 3, maxY: 3 }, 0, 0, 0, 0, out)).toBe(false);
  });

  it('keeps point-ray tolerance invariant when direction is rescaled', () => {
    const shape: CollisionShape2D = { kind: 'point', x: 2, y: 1e-6 };
    expect(raycastCollisionShape2D(shape, 0, 0, 1, 0, hit())).toBe(false);
    expect(raycastCollisionShape2D(shape, 0, 0, 1e6, 0, hit())).toBe(false);
  });
});
