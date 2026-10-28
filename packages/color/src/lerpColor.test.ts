// Generated from crates/flight-color/tests/lerp_color_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { allocateLinearColor, lerpColor, lerpLinearColor } from './contract.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  expect(diff < 1e-4, `expected ${expected}, got ${actual} (diff: ${diff})`).toBe(true);
}

describe('lerpColor', () => {
  it('returns start at t 0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 0.0)).toEqual(0xff0000ff);
  });
  it('returns end at t 1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 1.0)).toEqual(0x0000ffff);
  });
  it('clamps t below 0 to 0', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, -1.0)).toEqual(0xff0000ff);
  });
  it('clamps t above 1 to 1', () => {
    expect(lerpColor(0xff0000ff, 0x0000ffff, 2.0)).toEqual(0x0000ffff);
  });
  it('midpoint between black and white is approximately mid gray', () => {
    const mid = lerpColor(0x000000ff, 0xffffffff, 0.5);
    const r = (mid >> 24) & 0xff;
    expect(Math.abs((r | 0) - 0xbc) < 5, `expected red near 0xbc, got 0x${r.toString(16).padStart(2, '0')}`).toBe(true);
  });
});

describe('lerpLinearColor', () => {
  it('returns start at t 0', () => {
    let out = allocateLinearColor();
    let start = allocateLinearColor();
    start.r = 1.0;
    start.a = 1.0;
    let end = allocateLinearColor();
    end.b = 1.0;
    end.a = 1.0;
    lerpLinearColor(out, start, end, 0.0);
    expect(out.r).toEqual(start.r);
    expect(out.g).toEqual(start.g);
    expect(out.b).toEqual(start.b);
    expect(out.a).toEqual(start.a);
  });
  it('returns end at t 1', () => {
    let out = allocateLinearColor();
    let start = allocateLinearColor();
    start.r = 1.0;
    start.a = 1.0;
    let end = allocateLinearColor();
    end.b = 1.0;
    end.a = 1.0;
    lerpLinearColor(out, start, end, 1.0);
    expect(out.r).toEqual(end.r);
    expect(out.g).toEqual(end.g);
    expect(out.b).toEqual(end.b);
    expect(out.a).toEqual(end.a);
  });
  it('is alias safe when out is the same object as start', () => {
    let out = allocateLinearColor();
    out.r = 1.0;
    out.a = 1.0;
    let outCopy = allocateLinearColor();
    outCopy.r = out.r;
    outCopy.g = out.g;
    outCopy.b = out.b;
    outCopy.a = out.a;
    let end = allocateLinearColor();
    end.b = 1.0;
    end.a = 1.0;
    lerpLinearColor(out, outCopy, end, 0.5);
    assertApprox(out.r, 0.5);
    assertApprox(out.b, 0.5);
  });
});
