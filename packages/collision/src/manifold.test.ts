import { describe, expect, it } from 'vitest';

import { clearCollisionManifold2D, createCollisionManifold2D } from './manifold';

describe('clearCollisionManifold2D', () => {
  it('resets every field to the non-overlapping state', () => {
    const manifold = { overlapping: true, normalX: 0.5, normalY: -0.5, depth: 3 };
    clearCollisionManifold2D(manifold);
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
  });
});

describe('createCollisionManifold2D', () => {
  it('allocates a fresh manifold in the non-overlapping state', () => {
    const manifold = createCollisionManifold2D();
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
  });

  it('returns an independent object each call', () => {
    const a = createCollisionManifold2D();
    const b = createCollisionManifold2D();
    a.overlapping = true;
    expect(b.overlapping).toBe(false);
  });
});
