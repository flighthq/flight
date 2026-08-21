import type { CollisionShape2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { getCollisionPairTest2D } from './collisionSupport2D';
import { createCollisionManifold2D } from './manifold';
import { registerBuiltInCollisionPairTests2D } from './registerBuiltInCollisionPairTests2D';
import { testCircleAabbCollision } from './shapeCollision';

registerBuiltInCollisionPairTests2D();

describe('registerBuiltInCollisionPairTests2D', () => {
  it('registers exactly the ten canonical orders, and not their reverses', () => {
    const kinds = ['circle', 'aabb', 'obb', 'polygon'];
    const registered: string[] = [];
    for (const kindA of kinds) {
      for (const kindB of kinds) {
        if (getCollisionPairTest2D(kindA, kindB) !== null) registered.push(`${kindA}-${kindB}`);
      }
    }

    // Ten, not sixteen: the four self-pairs plus one order of each of the six mixed pairs. The reverse
    // orders are absent on purpose — `testCollision2D` reaches them by trying the reverse key and
    // negating, so registering both would double the table for no new geometry.
    expect(registered).toEqual([
      'circle-circle',
      'circle-aabb',
      'circle-obb',
      'circle-polygon',
      'aabb-aabb',
      'aabb-obb',
      'aabb-polygon',
      'obb-obb',
      'obb-polygon',
      'polygon-polygon',
    ]);
  });

  it('leaves the area-less kinds out of the table entirely', () => {
    for (const kind of ['segment', 'point']) {
      expect(getCollisionPairTest2D('circle', kind)).toBeNull();
      expect(getCollisionPairTest2D(kind, 'circle')).toBeNull();
    }
  });

  it('routes each entry to the direct typed test it specializes', () => {
    const throughRegistry = createCollisionManifold2D();
    const direct = createCollisionManifold2D();
    const circle: CollisionShape2D = { kind: 'circle', x: 15, y: 5, radius: 7 };
    const box: CollisionShape2D = { kind: 'aabb', minX: 0, minY: 0, maxX: 10, maxY: 10 };

    const entry = getCollisionPairTest2D('circle', 'aabb');
    expect(entry).not.toBeNull();
    expect(entry?.(circle, box, throughRegistry)).toBe(true);
    expect(testCircleAabbCollision({ x: 15, y: 5, radius: 7 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, direct)).toBe(
      true,
    );

    // The adapter casts rather than re-dispatching, so this is what proves the cast lands on the right
    // function: an adapter wired to the wrong pair would still typecheck and still return a manifold.
    expect(throughRegistry).toEqual(direct);
  });
});
