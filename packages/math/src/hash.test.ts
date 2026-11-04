// Generated from crates/flight-math/tests/hash_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createRandomSourceFromHash, hash2D, hash3D, hashCombine, hashUint32 } from './contract.ts';

describe('createRandomSourceFromHash', () => {
  it('returns a random source that produces values in 0 1', () => {
    const rng = createRandomSourceFromHash(3, 7);
    for (let _ = 0; _ < 20; _ += 1) {
      const v = rng();
      expect(v >= 0.0).toBe(true);
      expect(v < 1.0).toBe(true);
    }
  });
  it('produces different sequences for different positions', () => {
    const a = createRandomSourceFromHash(0, 0);
    const b = createRandomSourceFromHash(1, 0);
    let differs = false;
    for (let _ = 0; _ < 10; _ += 1) {
      if (a() !== b()) {
        differs = true;
      }
    }
    expect(differs).toBe(true);
  });
  it('produces the same sequence for the same position', () => {
    const a = createRandomSourceFromHash(5, 9);
    const b = createRandomSourceFromHash(5, 9);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(a()).toEqual(b());
    }
  });
});

describe('hash2D', () => {
  it('returns a non negative integer', () => {
    const h = hash2D(3, 7);
    expect(h >= 0).toBe(true);
  });
  it('is deterministic', () => {
    expect(hash2D(5, 10)).toEqual(hash2D(5, 10));
  });
  it('differs for different inputs', () => {
    expect(hash2D(0, 0)).not.toEqual(hash2D(1, 0));
    expect(hash2D(0, 0)).not.toEqual(hash2D(0, 1));
  });
});

describe('hash3D', () => {
  it('returns a non negative integer', () => {
    const h = hash3D(1, 2, 3);
    expect(h >= 0).toBe(true);
  });
  it('is deterministic', () => {
    expect(hash3D(1, 2, 3)).toEqual(hash3D(1, 2, 3));
  });
  it('differs for different inputs', () => {
    expect(hash3D(0, 0, 0)).not.toEqual(hash3D(1, 0, 0));
    expect(hash3D(0, 0, 0)).not.toEqual(hash3D(0, 0, 1));
  });
});

describe('hashCombine', () => {
  it('returns a number', () => {
    hashCombine(1, 2);
  });
  it('is deterministic', () => {
    expect(hashCombine(100, 200)).toEqual(hashCombine(100, 200));
  });
  it('produces different results for different seeds', () => {
    expect(hashCombine(1, 100)).not.toEqual(hashCombine(2, 100));
  });
  it('pins the complete multi term mix with a known answer vector', () => {
    expect(hashCombine(100, 200)).toEqual(3347962280);
  });
});

describe('hashUint32', () => {
  it('returns a non negative integer', () => {
    const h = hashUint32(42);
    expect(h >= 0).toBe(true);
  });
  it('is deterministic', () => {
    expect(hashUint32(12345)).toEqual(hashUint32(12345));
  });
  it('produces different results for different inputs', () => {
    expect(hashUint32(0)).not.toEqual(hashUint32(1));
    expect(hashUint32(100)).not.toEqual(hashUint32(101));
  });
  it('handles 0', () => {
    hashUint32(0);
  });
});
