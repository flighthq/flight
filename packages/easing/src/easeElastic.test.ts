// Generated from crates/flight-easing/tests/ease_elastic_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeInElastic, easeInOutElastic, easeOutElastic } from './contract.ts';

describe('easeInElastic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInElastic(0.0)).toEqual(0.0);
    expect(easeInElastic(1.0)).toEqual(1.0);
  });
  it('oscillates below 0 before reaching target', () => {
    expect(easeInElastic(0.8) < 0.0).toBe(true);
  });
});

describe('easeInOutElastic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeInOutElastic(0.0)).toEqual(0.0);
    expect(easeInOutElastic(1.0)).toEqual(1.0);
  });
});

describe('easeOutElastic', () => {
  it('returns 0 at t 0 and 1 at t 1', () => {
    expect(easeOutElastic(0.0)).toEqual(0.0);
    expect(easeOutElastic(1.0)).toEqual(1.0);
  });
  it('oscillates past 1 near the end', () => {
    expect(easeOutElastic(0.6) > 1.0).toBe(true);
  });
});
