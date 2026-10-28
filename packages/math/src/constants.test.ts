// Generated from crates/flight-math/tests/constants_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { CIRCLE_KAPPA, DEG_TO_RAD, EPSILON, HALF_PI, RAD_TO_DEG, TAU } from './contract.ts';

const PI = Math.PI;

function assertClose(actual: number, expected: number, digits: number): void {
  const diff = Math.abs(actual - expected);
  const tsBound = 0.5 * Math.pow(10.0, -digits);
  const limit = Math.max(tsBound, 4.0 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1.0));
  expect(diff <= limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('circleKappa', () => {
  it('equals four thirds of the square root of two less one', () => {
    const expected = (4.0 * (Math.sqrt(2.0) - 1.0)) / 3.0;
    const bound = 4.0 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1.0);
    expect(Math.abs(CIRCLE_KAPPA - expected) <= bound).toBe(true);
  });
  it('sweeps a unit quarter circle when used as the cubic control distance', () => {
    const radiusAt = (t: number): number => {
      const u = 1.0 - t;
      const x = u * u * u + 3.0 * u * u * t + 3.0 * u * t * t * CIRCLE_KAPPA;
      const y = 3.0 * u * u * t * CIRCLE_KAPPA + 3.0 * u * t * t + t * t * t;
      return Math.sqrt(x * x + y * y);
    };
    const samples = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const t of samples) {
      assertClose(radiusAt(t), 1.0, 3);
    }
  });
});

describe('degToRadConstant', () => {
  it('converts 180 degrees to pi', () => {
    assertClose(180.0 * DEG_TO_RAD, PI, 10);
  });
  it('converts 360 degrees to two pi', () => {
    assertClose(360.0 * DEG_TO_RAD, PI * 2.0, 10);
  });
});

describe('epsilonConstant', () => {
  it('is a positive number', () => {
    expect(EPSILON > 0.0).toBe(true);
  });
  it('is smaller than 1e minus 5', () => {
    expect(EPSILON < 1e-5).toBe(true);
  });
});

describe('halfPi', () => {
  it('equals pi over 2', () => {
    assertClose(HALF_PI, PI / 2.0, 10);
  });
});

describe('radToDegConstant', () => {
  it('converts pi radians to 180 degrees', () => {
    assertClose(PI * RAD_TO_DEG, 180.0, 10);
  });
  it('is the reciprocal of deg to rad', () => {
    assertClose(RAD_TO_DEG * DEG_TO_RAD, 1.0, 10);
  });
});

describe('tau', () => {
  it('equals two pi', () => {
    assertClose(TAU, PI * 2.0, 10);
  });
});
