import { createRandomSourceFromHash, hash2D, hash3D, hashCombine, hashUint32 } from './hash';

describe('createRandomSourceFromHash', () => {
  it('returns a random source that produces values in [0, 1)', () => {
    const rng = createRandomSourceFromHash(3, 7);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('produces different sequences for different (x, y) positions', () => {
    const a = createRandomSourceFromHash(0, 0);
    const b = createRandomSourceFromHash(1, 0);
    let differs = false;
    for (let i = 0; i < 10; i++) if (a() !== b()) differs = true;
    expect(differs).toBe(true);
  });
  it('produces the same sequence for the same (x, y)', () => {
    const a = createRandomSourceFromHash(5, 9);
    const b = createRandomSourceFromHash(5, 9);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});

describe('hash2D', () => {
  it('returns a non-negative integer', () => {
    const h = hash2D(3, 7);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
  it('is deterministic', () => {
    expect(hash2D(5, 10)).toBe(hash2D(5, 10));
  });
  it('differs for different inputs', () => {
    expect(hash2D(0, 0)).not.toBe(hash2D(1, 0));
    expect(hash2D(0, 0)).not.toBe(hash2D(0, 1));
  });
});

describe('hash3D', () => {
  it('returns a non-negative integer', () => {
    const h = hash3D(1, 2, 3);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
  it('is deterministic', () => {
    expect(hash3D(1, 2, 3)).toBe(hash3D(1, 2, 3));
  });
  it('differs for different inputs', () => {
    expect(hash3D(0, 0, 0)).not.toBe(hash3D(1, 0, 0));
    expect(hash3D(0, 0, 0)).not.toBe(hash3D(0, 0, 1));
  });
});

describe('hashCombine', () => {
  it('returns a number', () => {
    expect(typeof hashCombine(1, 2)).toBe('number');
  });
  it('is deterministic', () => {
    expect(hashCombine(100, 200)).toBe(hashCombine(100, 200));
  });
  it('produces different results for different seeds', () => {
    expect(hashCombine(1, 100)).not.toBe(hashCombine(2, 100));
  });
});

describe('hashUint32', () => {
  it('returns a non-negative integer', () => {
    const h = hashUint32(42);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
  it('is deterministic', () => {
    expect(hashUint32(12345)).toBe(hashUint32(12345));
  });
  it('produces different results for different inputs', () => {
    expect(hashUint32(0)).not.toBe(hashUint32(1));
    expect(hashUint32(100)).not.toBe(hashUint32(101));
  });
  it('handles 0', () => {
    expect(hashUint32(0)).toBeGreaterThanOrEqual(0);
  });
});
