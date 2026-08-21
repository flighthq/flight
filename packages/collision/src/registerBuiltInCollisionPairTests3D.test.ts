import { beforeEach, describe, expect, it } from 'vitest';

import { getCollisionPairTest3D, registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { createCollisionManifold3D } from './manifold3D';
import { registerBuiltInCollisionPairTests3D } from './registerBuiltInCollisionPairTests3D';
import { testCollision3D } from './testCollision3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionPairTests3D();
});

describe('registerBuiltInCollisionPairTests3D', () => {
  it('registers exactly the seven canonical orders', () => {
    for (const [kindA, kindB] of [
      ['aabb', 'aabb'],
      ['box', 'box'],
      ['capsule', 'capsule'],
      ['sphere', 'aabb'],
      ['sphere', 'box'],
      ['sphere', 'capsule'],
      ['sphere', 'sphere'],
    ] as const) {
      expect(getCollisionPairTest3D(kindA, kindB), `${kindA}-${kindB}`).not.toBeNull();
    }
  });

  it('leaves the reversed orders unregistered, since the dispatcher mirrors them', () => {
    // Registering both directions would double the table and give the same pair two implementations to
    // drift apart. testCollision3D tries the reversed key and negates the normal instead.
    expect(getCollisionPairTest3D('aabb', 'sphere')).toBeNull();
    expect(getCollisionPairTest3D('capsule', 'sphere')).toBeNull();
    expect(getCollisionPairTest3D('box', 'sphere')).toBeNull();
  });

  it('routes a reversed pair through the dispatcher with the normal negated', () => {
    const forward = createCollisionManifold3D();
    const reversed = createCollisionManifold3D();
    const sphere = { kind: 'sphere', radius: 1, x: 0, y: 2.5, z: 0 } as const;
    const box = { kind: 'aabb', maxX: 1, maxY: 2, maxZ: 1, minX: -1, minY: -2, minZ: -1 } as const;

    expect(testCollision3D(sphere, box, forward)).toBe(true);
    expect(testCollision3D(box, sphere, reversed)).toBe(true);
    expect(reversed.normalY).toBeCloseTo(-forward.normalY, 10);
    expect(reversed.depth).toBeCloseTo(forward.depth, 10);
  });

  it('takes precedence over the generic floor for a registered pair', () => {
    // Two exactly touching spheres. The closed form says not overlapping, which is the contracted reading
    // of a touching pair; an iterative solve is where that boundary gets fuzzy.
    const out = createCollisionManifold3D();
    expect(
      testCollision3D(
        { kind: 'sphere', radius: 1, x: 0, y: 0, z: 0 },
        { kind: 'sphere', radius: 1, x: 2, y: 0, z: 0 },
        out,
      ),
    ).toBe(false);
  });
});
