// Generated from crates/flight-easing/tests/ease_smoothstep_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeSmootherstep, easeSmoothstep, easeSmoothstepRange } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('easeSmootherstep', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeSmootherstep(0.0)).toEqual(0.0);
    expect(easeSmootherstep(1.0)).toEqual(1.0);
  });
  it('is symmetric about the midpoint', () => {
    assertApprox(easeSmootherstep(0.5), 0.5);
  });
  it('approaches endpoints more gently than smoothstep', () => {
    expect(easeSmootherstep(0.25) < easeSmoothstep(0.25)).toBe(true);
  });
  it('is monotonically increasing', () => {
    let prev = easeSmootherstep(0.0);
    for (let i = 1; i <= 20; i += 1) {
      const value = easeSmootherstep(i / 20.0);
      expect(value >= prev).toBe(true);
      prev = value;
    }
  });
});

describe('easeSmoothstep', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeSmoothstep(0.0)).toEqual(0.0);
    expect(easeSmoothstep(1.0)).toEqual(1.0);
  });
  it('is symmetric about the midpoint', () => {
    assertApprox(easeSmoothstep(0.5), 0.5);
  });
  it('matches the known cubic value at t 0 25', () => {
    assertApprox(easeSmoothstep(0.25), 0.15625);
  });
  it('is monotonically increasing', () => {
    let prev = easeSmoothstep(0.0);
    for (let i = 1; i <= 20; i += 1) {
      const value = easeSmoothstep(i / 20.0);
      expect(value >= prev).toBe(true);
      prev = value;
    }
  });
});

describe('easeSmoothstepRange', () => {
  it('returns 0 at edge0 and 1 at edge1', () => {
    const f = easeSmoothstepRange(10.0, 20.0);
    expect(f(10.0)).toEqual(0.0);
    expect(f(20.0)).toEqual(1.0);
  });
  it('clamps below edge0 to 0 and above edge1 to 1', () => {
    const f = easeSmoothstepRange(10.0, 20.0);
    expect(f(5.0)).toEqual(0.0);
    expect(f(25.0)).toEqual(1.0);
  });
  it('applies smoothstep at the midpoint', () => {
    const f = easeSmoothstepRange(0.0, 100.0);
    assertApprox(f(50.0), 0.5);
  });
  it('inverts the remap direction when edge0 greater than edge1', () => {
    const f = easeSmoothstepRange(20.0, 10.0);
    expect(f(20.0)).toEqual(0.0);
    expect(f(10.0)).toEqual(1.0);
    assertApprox(f(15.0), 0.5);
  });
  it('matches ease smoothstep when range is 0 to 1', () => {
    const f = easeSmoothstepRange(0.0, 1.0);
    for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      assertApprox(f(t), easeSmoothstep(t));
    }
  });
  it('returns expected values for degenerate zero width range', () => {
    const f = easeSmoothstepRange(5.0, 5.0);
    expect(Number.isNaN(f(5.0))).toBe(true);
    expect(f(6.0)).toEqual(1.0);
    expect(f(4.0)).toEqual(0.0);
  });
});
