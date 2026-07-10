import { describe, expect, it } from 'vitest';

import { clearCollisionManifold, createCollisionManifold } from './manifold';

describe('clearCollisionManifold', () => {
  it('resets every field to the non-overlapping state', () => {
    const manifold = { overlapping: true, normalX: 0.5, normalY: -0.5, depth: 3 };
    clearCollisionManifold(manifold);
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
  });
});

describe('createCollisionManifold', () => {
  it('allocates a fresh manifold in the non-overlapping state', () => {
    const manifold = createCollisionManifold();
    expect(manifold.overlapping).toBe(false);
    expect(manifold.normalX).toBe(0);
    expect(manifold.normalY).toBe(0);
    expect(manifold.depth).toBe(0);
  });

  it('returns an independent object each call', () => {
    const a = createCollisionManifold();
    const b = createCollisionManifold();
    a.overlapping = true;
    expect(b.overlapping).toBe(false);
  });
});
