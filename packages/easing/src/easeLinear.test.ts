// Generated from crates/flight-easing/tests/ease_linear_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { easeLinear } from './contract.ts';

describe('easeLinear', () => {
  it('returns 0 at t 0', () => {
    expect(easeLinear(0.0)).toEqual(0.0);
  });
  it('returns 1 at t 1', () => {
    expect(easeLinear(1.0)).toEqual(1.0);
  });
  it('returns t unchanged', () => {
    expect(easeLinear(0.5)).toEqual(0.5);
    expect(easeLinear(0.25)).toEqual(0.25);
    expect(easeLinear(0.75)).toEqual(0.75);
  });
});
