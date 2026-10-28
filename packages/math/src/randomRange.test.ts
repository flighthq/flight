// Generated from crates/flight-math/tests/random_range_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createRandomSource, randomBool, randomInt, randomRange, randomSign } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

describe('randomBool', () => {
  it('returns only booleans', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 100; _ += 1) {
      const V: boolean = randomBool(random, undefined);
    }
  });
  it('returns true with probability 1', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 10; _ += 1) {
      expect(randomBool(random, 1.0)).toBe(true);
    }
  });
  it('returns false with probability 0', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 10; _ += 1) {
      expect(!randomBool(random, 0.0)).toBe(true);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(0xabcdef);
    const b = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomBool(a, undefined)).toEqual(randomBool(b, undefined));
    }
  });
  it('uses a half open comparison at the probability boundary', () => {
    expect(!randomBool(() => 0.5, 0.5)).toBe(true);
  });
});

describe('randomInt', () => {
  it('returns integers within min max', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 200; _ += 1) {
      const v = randomInt(random, 0, 9);
      expect(v >= 0).toBe(true);
      expect(v <= 9).toBe(true);
    }
  });
  it('returns min when min equals max', () => {
    const random = createRandomSource(0xabcdef);
    expect(randomInt(random, 5, 5)).toEqual(5);
  });
  it('throws when min greater than max', () => {
    crate.assertRangeError(() => {
      const random = createRandomSource(0xabcdef);
      randomInt(random, 10, 5);
    }, 'randomInt: min must be <= max');
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(0xabcdef);
    const b = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomInt(a, 0, 100)).toEqual(randomInt(b, 0, 100));
    }
  });
  it('can select the inclusive upper endpoint', () => {
    expect(randomInt(() => 0.999999, 2, 4)).toEqual(4);
  });
});

describe('randomRange', () => {
  it('returns values within min max', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 200; _ += 1) {
      const v = randomRange(random, 5.0, 10.0);
      expect(v >= 5.0).toBe(true);
      expect(v < 10.0).toBe(true);
    }
  });
  it('returns min when min equals max', () => {
    const random = createRandomSource(0xabcdef);
    expect(randomRange(random, 3.0, 3.0)).toEqual(3.0);
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(0xabcdef);
    const b = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomRange(a, 0.0, 100.0)).toEqual(randomRange(b, 0.0, 100.0));
    }
  });
});

describe('randomSign', () => {
  it('returns only 1 or negative 1', () => {
    const random = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 100; _ += 1) {
      const v = randomSign(random);
      expect(v === 1.0 || v === -1.0).toBe(true);
    }
  });
  it('produces both signs', () => {
    const random = createRandomSource(0xabcdef);
    let sawPositive = false;
    let sawNegative = false;
    for (let _ = 0; _ < 100; _ += 1) {
      const v = randomSign(random);
      if (v === 1.0) {
        sawPositive = true;
      }
      if (v === -1.0) {
        sawNegative = true;
      }
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(0xabcdef);
    const b = createRandomSource(0xabcdef);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomSign(a)).toEqual(randomSign(b));
    }
  });
  it('selects the positive sign at the half open boundary', () => {
    expect(randomSign(() => 0.5)).toEqual(1.0);
  });
});
