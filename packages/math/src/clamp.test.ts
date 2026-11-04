// Generated from crates/flight-math/tests/clamp_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { clamp, inRange, saturate } from './contract.ts';

describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5.0, 0.0, 10.0)).toEqual(0.0);
  });
  it('clamps above maximum', () => {
    expect(clamp(15.0, 0.0, 10.0)).toEqual(10.0);
  });
  it('leaves value within range unchanged', () => {
    expect(clamp(5.0, 0.0, 10.0)).toEqual(5.0);
  });
  it('leaves value equal to min unchanged', () => {
    expect(clamp(0.0, 0.0, 10.0)).toEqual(0.0);
  });
  it('leaves value equal to max unchanged', () => {
    expect(clamp(10.0, 0.0, 10.0)).toEqual(10.0);
  });
  it('propagates nan', () => {
    expect(Number.isNaN(clamp(Number.NaN, 0.0, 10.0))).toBe(true);
  });
});

describe('inRange', () => {
  it('returns true for a value within range', () => {
    expect(inRange(5.0, 0.0, 10.0)).toBe(true);
  });
  it('returns true at the minimum boundary', () => {
    expect(inRange(0.0, 0.0, 10.0)).toBe(true);
  });
  it('returns true at the maximum boundary', () => {
    expect(inRange(10.0, 0.0, 10.0)).toBe(true);
  });
  it('returns false below minimum', () => {
    expect(!inRange(-1.0, 0.0, 10.0)).toBe(true);
  });
  it('returns false above maximum', () => {
    expect(!inRange(11.0, 0.0, 10.0)).toBe(true);
  });
});

describe('saturate', () => {
  it('clamps below 0 to 0', () => {
    expect(saturate(-1.0)).toEqual(0.0);
  });
  it('clamps above 1 to 1', () => {
    expect(saturate(2.0)).toEqual(1.0);
  });
  it('leaves value within 0 1 unchanged', () => {
    expect(saturate(0.5)).toEqual(0.5);
  });
  it('leaves 0 unchanged', () => {
    expect(saturate(0.0)).toEqual(0.0);
  });
  it('leaves 1 unchanged', () => {
    expect(saturate(1.0)).toEqual(1.0);
  });
  it('returns 0 for nan gpu semantics', () => {
    expect(saturate(Number.NaN)).toEqual(0.0);
  });
});
