import type { CollisionRaycastHit, CollisionShape } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createCollisionRaycastHit, raycastCollisionShape } from './raycastCollisionShape';

function hit(): CollisionRaycastHit {
  return createCollisionRaycastHit();
}

describe('createCollisionRaycastHit', () => {
  it('starts in the reusable miss state', () => {
    expect(createCollisionRaycastHit()).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });
});

describe('raycastCollisionShape', () => {
  it.each([
    ['circle', { kind: 'circle', x: 3, y: 0, radius: 1 }, 2, -1, 0],
    ['aabb', { kind: 'aabb', minX: 2, minY: -1, maxX: 4, maxY: 1 }, 2, -1, 0],
    ['obb', { kind: 'obb', x: 3, y: 0, halfW: 1, halfH: 1, rotation: 0 }, 2, -1, 0],
    ['polygon', { kind: 'polygon', points: [2, -1, 4, -1, 4, 1, 2, 1] }, 2, -1, 0],
    ['segment', { kind: 'segment', x0: 2, y0: -1, x1: 2, y1: 1 }, 2, -1, 0],
    ['point', { kind: 'point', x: 2, y: 0 }, 2, 0, 0],
  ] as const)('hits a %s at its first exact fraction', (_name, shape, fraction, normalX, normalY) => {
    const out = hit();
    expect(raycastCollisionShape(shape as CollisionShape, 0, 0, 1, 0, out)).toBe(true);
    expect(out.fraction).toBeCloseTo(fraction);
    expect(out.x).toBeCloseTo(fraction);
    expect(out.y).toBeCloseTo(0);
    expect(out.normalX).toBeCloseTo(normalX);
    expect(out.normalY).toBeCloseTo(normalY);
  });

  it('rotates an oriented-box hit normal back to world space', () => {
    const out = hit();
    const shape: CollisionShape = { kind: 'obb', x: 3, y: 0, halfW: 1, halfH: 0.5, rotation: Math.PI / 4 };
    expect(raycastCollisionShape(shape, 0, 0, 1, 0, out)).toBe(true);
    expect(out.normalX).toBeCloseTo(-Math.SQRT1_2);
    expect(out.normalY).toBeCloseTo(Math.SQRT1_2);
  });

  it('reports an origin inside a shape at fraction zero with no entry normal', () => {
    const out = hit();
    expect(raycastCollisionShape({ kind: 'circle', x: 0, y: 0, radius: 2 }, 0, 0, 1, 0, out)).toBe(true);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });

  it('honours maxFraction and clears output on a miss', () => {
    const out = { fraction: 9, x: 9, y: 9, normalX: 9, normalY: 9 };
    expect(raycastCollisionShape({ kind: 'circle', x: 3, y: 0, radius: 1 }, 0, 0, 1, 0, out, 1)).toBe(false);
    expect(out).toEqual({ fraction: 0, x: 0, y: 0, normalX: 0, normalY: 0 });
  });

  it('treats a zero direction as an exact point query', () => {
    const out = hit();
    expect(raycastCollisionShape({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0, 0, 0, 0, out)).toBe(true);
    expect(raycastCollisionShape({ kind: 'aabb', minX: 2, minY: 2, maxX: 3, maxY: 3 }, 0, 0, 0, 0, out)).toBe(false);
  });

  it('keeps point-ray tolerance invariant when direction is rescaled', () => {
    const shape: CollisionShape = { kind: 'point', x: 2, y: 1e-6 };
    expect(raycastCollisionShape(shape, 0, 0, 1, 0, hit())).toBe(false);
    expect(raycastCollisionShape(shape, 0, 0, 1e6, 0, hit())).toBe(false);
  });
});
