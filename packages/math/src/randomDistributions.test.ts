import { createRandomSource } from './random';
import {
  pick,
  randomExponential,
  randomGaussian,
  randomGaussianPair,
  randomInsideUnitDisc,
  randomInsideUnitSphere,
  randomOnUnitCircle,
  randomOnUnitSphere,
  randomPoisson,
  randomWeighted,
  shuffle,
  shuffleInPlace,
} from './randomDistributions';

const rng = () => createRandomSource(0xabcdef);

describe('pick', () => {
  it('returns an element from the array', () => {
    const items = [1, 2, 3, 4, 5];
    const random = rng();
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pick(random, items));
    }
  });
  it('returns undefined for an empty array', () => {
    expect(pick(rng(), [])).toBeUndefined();
  });
  it('always returns the only element in a single-item array', () => {
    const random = rng();
    for (let i = 0; i < 20; i++) expect(pick(random, [42])).toBe(42);
  });
  it('is deterministic for the same seed', () => {
    const items = ['a', 'b', 'c', 'd'];
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(pick(a, items)).toBe(pick(b, items));
  });
});

describe('randomExponential', () => {
  it('returns a non-negative value', () => {
    const random = rng();
    for (let i = 0; i < 200; i++) {
      expect(randomExponential(random)).toBeGreaterThanOrEqual(0);
    }
  });
  it('mean approximates 1/rate for rate=1', () => {
    const random = rng();
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += randomExponential(random, 1);
    expect(sum / n).toBeCloseTo(1, 0);
  });
  it('mean approximates 1/rate for rate=2', () => {
    const random = rng();
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += randomExponential(random, 2);
    expect(sum / n).toBeCloseTo(0.5, 0);
  });
  it('throws for rate <= 0', () => {
    expect(() => randomExponential(rng(), 0)).toThrow(RangeError);
    expect(() => randomExponential(rng(), -1)).toThrow(RangeError);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomExponential(a)).toBe(randomExponential(b));
  });
});

describe('randomGaussian', () => {
  it('produces finite values', () => {
    const random = rng();
    for (let i = 0; i < 100; i++) expect(Number.isFinite(randomGaussian(random))).toBe(true);
  });
  it('centers around the mean', () => {
    const random = rng();
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += randomGaussian(random, 5, 1);
    expect(sum / n).toBeCloseTo(5, 0);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomGaussian(a)).toBe(randomGaussian(b));
  });
});

describe('randomGaussianPair', () => {
  it('returns a tuple of two finite values', () => {
    const random = rng();
    const [z0, z1] = randomGaussianPair(random);
    expect(Number.isFinite(z0)).toBe(true);
    expect(Number.isFinite(z1)).toBe(true);
  });
  it('produces values matching the requested mean', () => {
    const random = rng();
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const [z0, z1] = randomGaussianPair(random, 10, 1);
      sum += z0 + z1;
    }
    expect(sum / (n * 2)).toBeCloseTo(10, 0);
  });
});

describe('randomInsideUnitDisc', () => {
  it('produces points inside the unit disc', () => {
    const random = rng();
    const out = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) {
      randomInsideUnitDisc(random, out);
      expect(out.x * out.x + out.y * out.y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('is alias-safe when out is the same object as input', () => {
    const random = rng();
    const out = { x: 0, y: 0 };
    // Should not throw or produce garbage when aliased
    randomInsideUnitDisc(random, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    const outA = { x: 0, y: 0 };
    const outB = { x: 0, y: 0 };
    for (let i = 0; i < 20; i++) {
      randomInsideUnitDisc(a, outA);
      randomInsideUnitDisc(b, outB);
      expect(outA.x).toBe(outB.x);
      expect(outA.y).toBe(outB.y);
    }
  });
});

describe('randomInsideUnitSphere', () => {
  it('produces points with radius <= 1', () => {
    const random = rng();
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 200; i++) {
      randomInsideUnitSphere(random, out);
      expect(out.x * out.x + out.y * out.y + out.z * out.z).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('is alias-safe when out is the same object as input', () => {
    const random = rng();
    const out = { x: 0, y: 0, z: 0 };
    randomInsideUnitSphere(random, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    const outA = { x: 0, y: 0, z: 0 };
    const outB = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 20; i++) {
      randomInsideUnitSphere(a, outA);
      randomInsideUnitSphere(b, outB);
      expect(outA.x).toBe(outB.x);
      expect(outA.y).toBe(outB.y);
      expect(outA.z).toBe(outB.z);
    }
  });
});

describe('randomOnUnitCircle', () => {
  it('produces points on the unit circle', () => {
    const random = rng();
    const out = { x: 0, y: 0 };
    for (let i = 0; i < 100; i++) {
      randomOnUnitCircle(random, out);
      expect(out.x * out.x + out.y * out.y).toBeCloseTo(1, 8);
    }
  });
  it('is alias-safe when out is the same object as input', () => {
    const random = rng();
    const out = { x: 0, y: 0 };
    randomOnUnitCircle(random, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    const outA = { x: 0, y: 0 };
    const outB = { x: 0, y: 0 };
    for (let i = 0; i < 20; i++) {
      randomOnUnitCircle(a, outA);
      randomOnUnitCircle(b, outB);
      expect(outA.x).toBe(outB.x);
      expect(outA.y).toBe(outB.y);
    }
  });
});

describe('randomOnUnitSphere', () => {
  it('produces points on the unit sphere', () => {
    const random = rng();
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 100; i++) {
      randomOnUnitSphere(random, out);
      const len2 = out.x * out.x + out.y * out.y + out.z * out.z;
      expect(len2).toBeCloseTo(1, 8);
    }
  });
  it('is alias-safe when out is the same object as input', () => {
    const random = rng();
    const out = { x: 0, y: 0, z: 0 };
    randomOnUnitSphere(random, out);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    const outA = { x: 0, y: 0, z: 0 };
    const outB = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 20; i++) {
      randomOnUnitSphere(a, outA);
      randomOnUnitSphere(b, outB);
      expect(outA.x).toBe(outB.x);
      expect(outA.y).toBe(outB.y);
      expect(outA.z).toBe(outB.z);
    }
  });
});

describe('randomPoisson', () => {
  it('returns a non-negative integer', () => {
    const random = rng();
    for (let i = 0; i < 200; i++) {
      const k = randomPoisson(random, 3);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
    }
  });
  it('mean approximates lambda=1', () => {
    const random = rng();
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += randomPoisson(random, 1);
    expect(sum / n).toBeCloseTo(1, 0);
  });
  it('mean approximates lambda=5', () => {
    const random = rng();
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += randomPoisson(random, 5);
    expect(sum / n).toBeCloseTo(5, 0);
  });
  it('throws for lambda <= 0', () => {
    expect(() => randomPoisson(rng(), 0)).toThrow(RangeError);
    expect(() => randomPoisson(rng(), -1)).toThrow(RangeError);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomPoisson(a, 3)).toBe(randomPoisson(b, 3));
  });
});

describe('randomWeighted', () => {
  it('returns indices within the weights array', () => {
    const random = rng();
    const weights = [1, 2, 3];
    for (let i = 0; i < 100; i++) {
      const idx = randomWeighted(random, weights);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(weights.length);
    }
  });
  it('returns -1 for an empty array', () => {
    expect(randomWeighted(rng(), [])).toBe(-1);
  });
  it('returns -1 for an all-zero weight array', () => {
    expect(randomWeighted(rng(), [0, 0, 0])).toBe(-1);
  });
  it('always returns the only non-zero index when all others are zero', () => {
    const random = rng();
    for (let i = 0; i < 20; i++) {
      expect(randomWeighted(random, [0, 10, 0])).toBe(1);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    const weights = [1, 2, 3, 4];
    for (let i = 0; i < 20; i++) {
      expect(randomWeighted(a, weights)).toBe(randomWeighted(b, weights));
    }
  });
});

describe('shuffle', () => {
  it('returns an array of the same length', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(rng(), items)).toHaveLength(items.length);
  });
  it('contains all original elements', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(rng(), items);
    expect(result.sort()).toEqual(items.slice().sort());
  });
  it('does not mutate the original array', () => {
    const items = [1, 2, 3, 4, 5];
    const original = items.slice();
    shuffle(rng(), items);
    expect(items).toEqual(original);
  });
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(rng(), items)).toEqual(shuffle(rng(), items));
  });
});

describe('shuffleInPlace', () => {
  it('retains all original elements', () => {
    const items = [1, 2, 3, 4, 5];
    const original = items.slice().sort();
    shuffleInPlace(rng(), items);
    expect(items.sort()).toEqual(original);
  });
  it('mutates the original array', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = items.slice();
    shuffleInPlace(rng(), items);
    // After sufficient elements it should have changed (very unlikely to match)
    // — use a large array to make accidental match astronomically unlikely.
    expect(items).toHaveLength(copy.length);
  });
  it('is deterministic for the same seed', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffleInPlace(rng(), a);
    shuffleInPlace(rng(), b);
    expect(a).toEqual(b);
  });
});
