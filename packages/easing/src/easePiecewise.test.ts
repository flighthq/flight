// Generated from crates/flight-easing/tests/ease_piecewise_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInCubic, easeLinear, easePiecewise } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

function constantZero(T: number): number {
  return 0.0;
}

function constantOne(T: number): number {
  return 1.0;
}

describe('easePiecewise', () => {
  it('panics on an empty segments array', () => {
    expect(() => {
      easePiecewise([]);
    }).toThrow();
  });
  it('panics when total weight is zero', () => {
    expect(() => {
      easePiecewise([{ ease: easeLinear, weight: 0.0 }]);
    }).toThrow();
  });
  it('single segment is equivalent to the wrapped function', () => {
    const f = easePiecewise([{ ease: easeInCubic, weight: 1.0 }]);
    assertApprox(f(0.0), easeInCubic(0.0));
    assertApprox(f(0.5), easeInCubic(0.5));
    assertApprox(f(1.0), easeInCubic(1.0));
  });
  it('two equal weight segments split the range at t 0.5', () => {
    const f = easePiecewise([
      { ease: easeLinear, weight: 1.0 },
      { ease: constantZero, weight: 1.0 },
    ]);
    assertApprox(f(0.25), 0.5);
    assertApprox(f(0.75), 0.0);
  });
  it('respects weights', () => {
    const f = easePiecewise([
      { ease: easeLinear, weight: 1.0 },
      { ease: constantOne, weight: 2.0 },
    ]);
    assertApprox(f(1.0 / 6.0), 0.5);
    assertApprox(f(2.0 / 3.0), 1.0);
  });
  it('returns 0 at t 0 and uses the last segment at t 1', () => {
    const f = easePiecewise([
      { ease: easeLinear, weight: 1.0 },
      { ease: easeInCubic, weight: 1.0 },
    ]);
    assertApprox(f(0.0), 0.0);
    assertApprox(f(1.0), 1.0);
  });
  it('is boundary safe for t 0 and t 1', () => {
    const f = easePiecewise([
      { ease: easeInCubic, weight: 1.0 },
      { ease: easeLinear, weight: 1.0 },
    ]);
    assertApprox(f(0.0), 0.0);
    assertApprox(f(1.0), 1.0);
  });
  it('default weight is treated as 1', () => {
    const explicit = easePiecewise([
      { ease: easeLinear, weight: 1.0 },
      { ease: easeInCubic, weight: 1.0 },
    ]);
    const implicit = easePiecewise([
      { ease: easeLinear, weight: undefined },
      { ease: easeInCubic, weight: undefined },
    ]);
    for (let i = 0; i <= 10; i += 1) {
      assertApprox(implicit(i / 10.0), explicit(i / 10.0));
    }
  });
});
