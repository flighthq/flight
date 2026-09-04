import { describe, expect, it } from 'vitest';

import {
  clearCollisionContactManifold2D,
  createCollisionContactManifold2D,
  initializeCollisionContactManifold2D,
} from './contactManifold2D';

describe('clearCollisionContactManifold2D', () => {
  it('resets the manifold to the non-overlapping state', () => {
    const manifold = createCollisionContactManifold2D();
    manifold.overlapping = true;
    manifold.normalX = 1;
    manifold.normalY = -1;
    manifold.depth = 4;
    manifold.pointCount = 2;

    clearCollisionContactManifold2D(manifold);
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
    expect(manifold.pointCount).toBe(0);
  });

  it('keeps the point array allocated so a cleared manifold stays reusable', () => {
    const manifold = createCollisionContactManifold2D();
    const points = manifold.points;
    clearCollisionContactManifold2D(manifold);
    expect(manifold.points).toBe(points);
    expect(manifold.points).toHaveLength(2);
  });
});

describe('createCollisionContactManifold2D', () => {
  it('starts non-overlapping with zeroed normal, depth, and point count', () => {
    const manifold = createCollisionContactManifold2D();
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
    expect(manifold.pointCount).toBe(0);
  });

  it('preallocates both contact points so the hot path never allocates', () => {
    const manifold = createCollisionContactManifold2D();
    expect(manifold.points).toHaveLength(2);
    for (const point of manifold.points) {
      expect(point).toMatchObject({ x: 0, y: 0, depth: 0, featureId: 0 });
    }
  });

  it('gives each manifold its own points rather than sharing one array', () => {
    const first = createCollisionContactManifold2D();
    const second = createCollisionContactManifold2D();
    expect(first.points).not.toBe(second.points);
    expect(first.points[0]).not.toBe(second.points[0]);
  });
});
describe('initializeCollisionContactManifold2D', () => {
  it('is the construction initializer of createCollisionContactManifold2D', () => {
    expect(typeof initializeCollisionContactManifold2D).toBe('function');
  });
});
