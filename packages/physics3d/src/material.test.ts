import { describe, expect, it } from 'vitest';

import { mixPhysics3DFriction, mixPhysics3DRestitution } from './material';

describe('mixPhysics3DFriction', () => {
  it('keeps a coefficient two equal surfaces share', () => {
    expect(mixPhysics3DFriction(0.3, 0.3)).toBeCloseTo(0.3, 12);
  });

  it('makes the pair frictionless when either surface is', () => {
    // Ice against anything slides. This is the property that makes the geometric mean the right mix and
    // an average the wrong one.
    expect(mixPhysics3DFriction(0, 0.9)).toBe(0);
    expect(mixPhysics3DFriction(0.9, 0)).toBe(0);
  });

  it('is symmetric, so a pair does not depend on which body was added first', () => {
    expect(mixPhysics3DFriction(0.2, 0.8)).toBeCloseTo(mixPhysics3DFriction(0.8, 0.2), 12);
  });

  it('lands between the two coefficients', () => {
    const mixed = mixPhysics3DFriction(0.1, 0.9);
    expect(mixed).toBeGreaterThan(0.1);
    expect(mixed).toBeLessThan(0.9);
  });
});

describe('mixPhysics3DRestitution', () => {
  it('takes the bouncier surface', () => {
    expect(mixPhysics3DRestitution(0.1, 0.8)).toBe(0.8);
  });

  it('is symmetric', () => {
    expect(mixPhysics3DRestitution(0.8, 0.1)).toBe(mixPhysics3DRestitution(0.1, 0.8));
  });

  it('keeps a pair of dead surfaces dead', () => {
    expect(mixPhysics3DRestitution(0, 0)).toBe(0);
  });
});
