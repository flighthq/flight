import { describe, expect, it } from 'vitest';

import { clearCollisionManifold3D, createCollisionManifold3D } from './manifold3D';

describe('clearCollisionManifold3D', () => {
  it('resets every field so a reused out never carries a stale normal into a miss', () => {
    const manifold = createCollisionManifold3D();
    manifold.overlapping = true;
    manifold.normalX = 1;
    manifold.normalY = 2;
    manifold.normalZ = 3;
    manifold.depth = 4;
    clearCollisionManifold3D(manifold);
    expect(manifold).toMatchObject({ overlapping: false, normalX: 0, normalY: 0, normalZ: 0, depth: 0 });
  });
});

describe('createCollisionManifold3D', () => {
  it('allocates in the non-overlapping state', () => {
    expect(createCollisionManifold3D()).toMatchObject({
      overlapping: false,
      normalX: 0,
      normalY: 0,
      normalZ: 0,
      depth: 0,
    });
  });

  it('returns a fresh record each call', () => {
    expect(createCollisionManifold3D()).not.toBe(createCollisionManifold3D());
  });
});
