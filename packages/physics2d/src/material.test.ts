import { describe, expect, it } from 'vitest';

import { mixPhysics2DFriction, mixPhysics2DRestitution } from './material';

describe('mixPhysics2DFriction', () => {
  it('keeps a pair frictionless when either surface has zero friction', () => {
    expect(mixPhysics2DFriction(0, 1)).toBe(0);
    expect(mixPhysics2DFriction(1, 0)).toBe(0);
  });

  it('is symmetric and leaves equal coefficients unchanged', () => {
    expect(mixPhysics2DFriction(0.25, 1)).toBe(mixPhysics2DFriction(1, 0.25));
    expect(mixPhysics2DFriction(0.36, 0.36)).toBeCloseTo(0.36);
  });

  it('does not overflow while the geometric mean remains finite', () => {
    const mixed = mixPhysics2DFriction(Number.MAX_VALUE, Number.MAX_VALUE);
    expect(Number.isFinite(mixed)).toBe(true);
    expect(mixed / Number.MAX_VALUE).toBeCloseTo(1);
  });
});

describe('mixPhysics2DRestitution', () => {
  it('uses the bouncier surface symmetrically', () => {
    expect(mixPhysics2DRestitution(0.2, 0.8)).toBe(0.8);
    expect(mixPhysics2DRestitution(0.8, 0.2)).toBe(0.8);
  });
});
