import { MAX_COLLISION_CONTACT_POINTS_3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  clearCollisionContactManifold3D,
  createCollisionContactManifold3D,
  initializeCollisionContactManifold3D,
} from './contactManifold3D';

describe('clearCollisionContactManifold3D', () => {
  it('resets the overlap state and the point count', () => {
    const manifold = createCollisionContactManifold3D();
    manifold.overlapping = true;
    manifold.normalX = 1;
    manifold.normalY = 2;
    manifold.normalZ = 3;
    manifold.pointCount = 4;
    clearCollisionContactManifold3D(manifold);
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.normalZ).toBe(0);
    expect(manifold.pointCount).toBe(0);
  });

  it('keeps the point array and its entries, so a held reference survives a miss', () => {
    const manifold = createCollisionContactManifold3D();
    const points = manifold.points;
    const first = points[0];
    clearCollisionContactManifold3D(manifold);
    expect(manifold.points).toBe(points);
    expect(manifold.points[0]).toBe(first);
    expect(manifold.points).toHaveLength(MAX_COLLISION_CONTACT_POINTS_3D);
  });
});

describe('createCollisionContactManifold3D', () => {
  it('allocates the full point array up front so the narrow phase never grows it', () => {
    const manifold = createCollisionContactManifold3D();
    expect(manifold.points).toHaveLength(MAX_COLLISION_CONTACT_POINTS_3D);
    expect(manifold.pointCount).toBe(0);
    expect(manifold.overlapping).toBe(false);
  });

  it('gives each manifold its own points', () => {
    expect(createCollisionContactManifold3D().points).not.toBe(createCollisionContactManifold3D().points);
  });
});
describe('initializeCollisionContactManifold3D', () => {
  it('is the construction initializer of createCollisionContactManifold3D', () => {
    expect(typeof initializeCollisionContactManifold3D).toBe('function');
  });
});
