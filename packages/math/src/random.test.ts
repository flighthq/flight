// Generated from crates/flight-math/tests/random_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createRandomSource } from './contract.ts';

describe('createRandomSource', () => {
  // Rust-only: atomic state preserves the stream across threads
  it('keeps the half open endpoint when a seeded sample rounds up', () => {
    const random = createRandomSource(52078625);
    const sample = random();
    expect(sample).toEqual(1.0 - Math.pow(2, -23) / 2.0);
    expect(sample < 1.0).toBe(true);
  });
  it('produces values in 0 1', () => {
    const rng = createRandomSource(1);
    for (let _ = 0; _ < 1000; _ += 1) {
      const v = rng();
      expect(v >= 0.0).toBe(true);
      expect(v < 1.0).toBe(true);
    }
  });
  it('is deterministic same seed yields the same sequence', () => {
    const a = createRandomSource(0xc0ffee);
    const b = createRandomSource(0xc0ffee);
    for (let _ = 0; _ < 100; _ += 1) {
      expect(a()).toEqual(b());
    }
  });
  it('different seeds yield different sequences', () => {
    const a = createRandomSource(1);
    const b = createRandomSource(2);
    let differs = false;
    for (let _ = 0; _ < 10; _ += 1) {
      if (a() !== b()) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });
  it('pins the mulberry32 transform with a known answer sequence', () => {
    const random = createRandomSource(0xc0ffee);
    expect(Array.from([random(), random(), random(), random()])).toEqual(
      Array.from([0.021141508361324668, 0.6661099966149777, 0.7799714196007699, 0.7395844468846917]),
    );
  });
  it('repeats the sequence when constructed with the same seed', () => {
    const rng = createRandomSource(42);
    const rng2 = createRandomSource(42);
    expect(rng()).toEqual(rng2());
  });
  it('advances the state and returns a value', () => {
    const rng = createRandomSource(0);
    const v1 = rng();
    const v2 = rng();
    expect(v1 >= 0.0 && v1 < 1.0).toBe(true);
    expect(v2 >= 0.0 && v2 < 1.0).toBe(true);
    expect(v1).not.toEqual(v2);
  });
  it('cloned callables advance the same stream', () => {
    const random = createRandomSource(42);
    const shared = random;
    const expected = createRandomSource(42);
    expect(random()).toEqual(expected());
    expect(shared()).toEqual(expected());
    expect(random()).toEqual(expected());
  });
});
