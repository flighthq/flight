// Generated from crates/flight-math/tests/random_distributions_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  createRandomSource,
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
} from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

function assertApprox(actual: number, expected: number): void {
  const diff = Math.abs(actual - expected);
  const limit = Math.max(5e-9, 4.0 * Math.pow(2, -23) * Math.max(Math.abs(expected), 1.0));
  expect(diff <= limit, `expected ${expected}, got ${actual} (diff: ${diff}, limit: ${limit})`).toBe(true);
}

describe('pick', () => {
  it('keeps seeded endpoint indices inside pick and shuffle buffers', () => {
    let random = createRandomSource(52078625);
    expect(pick(random, [0, 1, 2, 3])).toEqual(3);
    random = createRandomSource(52078625);
    let items = [0, 1, 2, 3];
    shuffleInPlace(random, items);
    items.sort((a, b) => a - b);
    expect(items).toEqual([0, 1, 2, 3]);
  });
  it('returns an element from the slice', () => {
    const items = [1, 2, 3, 4, 5];
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 50; _ += 1) {
      const result = pick(random, items);
      expect(result !== undefined).toBe(true);
      expect(items.includes(result!)).toBe(true);
    }
  });
  it('returns none for an empty slice', () => {
    const empty: Readonly<number[]> = [];
    expect(pick(createRandomSource(11259375), empty) === undefined).toBe(true);
  });
  it('always returns the only element in a single item slice', () => {
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(pick(random, [42])).toEqual(42);
    }
  });
  it('is deterministic for the same seed', () => {
    const items = ['a', 'b', 'c', 'd'];
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(pick(a, items)).toEqual(pick(b, items));
    }
  });
  it('selects the bucket named by an exact deterministic sample', () => {
    expect(pick(() => 0.75, ['a', 'b', 'c', 'd'])).toEqual('d');
  });
});

describe('randomExponential', () => {
  it('returns a non negative value', () => {
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 200; _ += 1) {
      expect(randomExponential(random, undefined) >= 0.0).toBe(true);
    }
  });
  it('mean approximates 1 over rate for rate 1', () => {
    const random = createRandomSource(11259375);
    let sum = 0.0;
    const n = 5000;
    for (let _ = 0; _ < n; _ += 1) {
      sum += randomExponential(random, undefined);
    }
    const avg = sum / n;
    expect(Math.abs(avg - 1.0) < 0.2).toBe(true);
  });
  it('mean approximates 1 over rate for rate 2', () => {
    const random = createRandomSource(11259375);
    let sum = 0.0;
    const n = 5000;
    for (let _ = 0; _ < n; _ += 1) {
      sum += randomExponential(random, 2.0);
    }
    const avg = sum / n;
    expect(Math.abs(avg - 0.5) < 0.2).toBe(true);
  });
  it('throws for rate zero', () => {
    crate.assertRangeError(() => {
      randomExponential(createRandomSource(11259375), 0.0);
    }, 'randomExponential: rate must be finite and > 0');
  });
  it('throws for negative rate', () => {
    crate.assertRangeError(() => {
      randomExponential(createRandomSource(11259375), -1.0);
    }, 'randomExponential: rate must be finite and > 0');
  });
  it('rejects nan rate', () => {
    crate.assertRangeError(() => {
      randomExponential(createRandomSource(11259375), Number.NaN);
    }, 'randomExponential: rate must be finite and > 0');
  });
  it('rejects infinite rate', () => {
    crate.assertRangeError(() => {
      randomExponential(createRandomSource(11259375), Number.POSITIVE_INFINITY);
    }, 'randomExponential: rate must be finite and > 0');
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomExponential(a, undefined)).toEqual(randomExponential(b, undefined));
    }
  });
  it('substitutes epsilon when the random source returns zero', () => {
    expect(randomExponential(() => 0.0, undefined)).toEqual(-Math.log(2.220446049250313e-16));
  });
});

describe('randomGaussian', () => {
  it('produces finite values', () => {
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 100; _ += 1) {
      expect(Number.isFinite(randomGaussian(random, undefined, undefined))).toBe(true);
    }
  });
  it('centers around the mean', () => {
    const random = createRandomSource(11259375);
    let sum = 0.0;
    const n = 2000;
    for (let _ = 0; _ < n; _ += 1) {
      sum += randomGaussian(random, 5.0, undefined);
    }
    const avg = sum / n;
    expect(Math.abs(avg - 5.0) < 0.5).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomGaussian(a, undefined, undefined)).toEqual(randomGaussian(b, undefined, undefined));
    }
  });
  it('substitutes epsilon when the first random sample is zero', () => {
    const random = crate.sequenceRandom([0.0, 0.25]);
    const actual = randomGaussian(random, undefined, undefined);
    expect(Math.abs(actual) < 5e-11, `TS zero-sample value should be close to 0 at 10 digits, got ${actual}`).toBe(
      true,
    );
  });
  it('matches a deterministic box muller vector with mean and scale', () => {
    const standard = Math.sqrt(-2.0 * Math.log(0.5));
    const random = crate.sequenceRandom([0.5, 0.0]);
    expect(Math.abs(randomGaussian(random, 10.0, 2.0) - (10.0 + standard * 2.0)) < 5e-13).toBe(true);
  });
});

describe('randomGaussianPair', () => {
  it('returns a tuple of two finite values', () => {
    const random = createRandomSource(11259375);
    const [z0, z1] = randomGaussianPair(random, undefined, undefined);
    expect(Number.isFinite(z0)).toBe(true);
    expect(Number.isFinite(z1)).toBe(true);
  });
  it('produces values matching the requested mean', () => {
    const random = createRandomSource(11259375);
    let sum = 0.0;
    const n = 2000;
    for (let _ = 0; _ < n; _ += 1) {
      const [z0, z1] = randomGaussianPair(random, 10.0, undefined);
      sum += z0 + z1;
    }
    const avg = sum / (n * 2);
    expect(Math.abs(avg - 10.0) < 0.5).toBe(true);
  });
  it('substitutes epsilon when the first random sample is zero', () => {
    const random = crate.sequenceRandom([0.0, 0.25]);
    const [z0, z1] = randomGaussianPair(random, undefined, undefined);
    expect(Math.abs(z0) < 5e-11, `TS zero-sample first component should be close to 0 at 10 digits, got ${z0}`).toBe(
      true,
    );
    expect(Math.abs(z1 - Math.sqrt(-2.0 * Math.log(2.220446049250313e-16))) < 5e-11).toBe(true);
  });
  it('matches both values of a deterministic box muller pair', () => {
    const component = Math.sqrt(-2.0 * Math.log(0.5)) * Math.SQRT1_2;
    const random = crate.sequenceRandom([0.5, 0.125]);
    expect(randomGaussianPair(random, 3.0, 2.0)).toEqual([3.0 + component * 2.0, 3.0 + component * 2.0]);
  });
});

describe('randomInsideUnitDisc', () => {
  it('produces points inside the unit disc', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(2).fill(0.0);
    for (let _ = 0; _ < 200; _ += 1) {
      randomInsideUnitDisc(out, random);
      expect(out[0] * out[0] + out[1] * out[1] <= 1.0 + 1e-9).toBe(true);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    let outA = new Float32Array(2).fill(0.0);
    let outB = new Float32Array(2).fill(0.0);
    for (let _ = 0; _ < 20; _ += 1) {
      randomInsideUnitDisc(outA, a);
      randomInsideUnitDisc(outB, b);
      expect(outA[0]).toEqual(outB[0]);
      expect(outA[1]).toEqual(outB[1]);
    }
  });
  it('is alias safe when out is the same object as input', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(2).fill(0.0);
    randomInsideUnitDisc(out, random);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
  });
  it('accepts and preserves a deterministic boundary point', () => {
    const random = crate.sequenceRandom([1.0, 0.5, 0.5, 0.5]);
    let out = new Float32Array(2).fill(0.0);
    randomInsideUnitDisc(out, random);
    expect(out).toEqual([1.0, 0.0]);
  });
});

describe('randomInsideUnitSphere', () => {
  it('produces points with radius less than or equal to 1', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(3).fill(0.0);
    for (let _ = 0; _ < 200; _ += 1) {
      randomInsideUnitSphere(out, random);
      expect(out[0] * out[0] + out[1] * out[1] + out[2] * out[2] <= 1.0 + 1e-9).toBe(true);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    let outA = new Float32Array(3).fill(0.0);
    let outB = new Float32Array(3).fill(0.0);
    for (let _ = 0; _ < 20; _ += 1) {
      randomInsideUnitSphere(outA, a);
      randomInsideUnitSphere(outB, b);
      expect(outA[0]).toEqual(outB[0]);
      expect(outA[1]).toEqual(outB[1]);
      expect(outA[2]).toEqual(outB[2]);
    }
  });
  it('is alias safe when out is the same object as input', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(3).fill(0.0);
    randomInsideUnitSphere(out, random);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
    expect(Number.isFinite(out[2])).toBe(true);
  });
  it('accepts and preserves a deterministic boundary point', () => {
    const random = crate.sequenceRandom([1.0, 0.5, 0.5, 0.5, 0.5, 0.5]);
    let out = new Float32Array(3).fill(0.0);
    randomInsideUnitSphere(out, random);
    expect(out).toEqual([1.0, 0.0, 0.0]);
  });
});

describe('randomOnUnitCircle', () => {
  it('produces points on the unit circle', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(2).fill(0.0);
    for (let _ = 0; _ < 100; _ += 1) {
      randomOnUnitCircle(out, random);
      assertApprox(out[0] * out[0] + out[1] * out[1], 1.0);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    let outA = new Float32Array(2).fill(0.0);
    let outB = new Float32Array(2).fill(0.0);
    for (let _ = 0; _ < 20; _ += 1) {
      randomOnUnitCircle(outA, a);
      randomOnUnitCircle(outB, b);
      expect(outA[0]).toEqual(outB[0]);
      expect(outA[1]).toEqual(outB[1]);
    }
  });
  it('is alias safe when out is the same object as input', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(2).fill(0.0);
    randomOnUnitCircle(out, random);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
  });
  it('maps a quarter turn sample to the top of the circle', () => {
    let out = new Float32Array(2).fill(0.0);
    randomOnUnitCircle(out, () => 0.25);
    expect(Math.abs(out[0]) < 5e-13, `TS quarter-turn x should be close to 0 at 12 digits, got ${out[0]}`).toBe(true);
    expect(Math.abs(out[1] - 1.0) < 5e-13).toBe(true);
  });
});

describe('randomOnUnitSphere', () => {
  it('produces points on the unit sphere', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(3).fill(0.0);
    for (let _ = 0; _ < 100; _ += 1) {
      randomOnUnitSphere(out, random);
      const len2 = out[0] * out[0] + out[1] * out[1] + out[2] * out[2];
      assertApprox(len2, 1.0);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    let outA = new Float32Array(3).fill(0.0);
    let outB = new Float32Array(3).fill(0.0);
    for (let _ = 0; _ < 20; _ += 1) {
      randomOnUnitSphere(outA, a);
      randomOnUnitSphere(outB, b);
      expect(outA[0]).toEqual(outB[0]);
      expect(outA[1]).toEqual(outB[1]);
      expect(outA[2]).toEqual(outB[2]);
    }
  });
  it('is alias safe when out is the same object as input', () => {
    const random = createRandomSource(11259375);
    let out = new Float32Array(3).fill(0.0);
    randomOnUnitSphere(out, random);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
    expect(Number.isFinite(out[2])).toBe(true);
  });
  it('projects a deterministic disc sample onto the sphere', () => {
    let out = new Float32Array(3).fill(0.0);
    const random = crate.sequenceRandom([0.75, 0.5]);
    randomOnUnitSphere(out, random);
    expect(Math.abs(out[0] - Math.sqrt(3.0) / 2.0) < 5e-13).toBe(true);
    expect(out[1]).toEqual(0.0);
    expect(out[2]).toEqual(0.5);
  });
  it('rejects a disc boundary sample before projecting', () => {
    let out = new Float32Array(3).fill(0.0);
    const random = crate.sequenceRandom([1.0, 0.5, 0.5, 0.5]);
    randomOnUnitSphere(out, random);
    expect(out).toEqual([0.0, 0.0, 1.0]);
  });
});

describe('randomPoisson', () => {
  it('returns a non negative integer', () => {
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 200; _ += 1) {
      const k = randomPoisson(random, 3.0);
      expect(k >= 0).toBe(true);
    }
  });
  it('mean approximates lambda 1', () => {
    const random = createRandomSource(11259375);
    let sum = 0;
    const n = 5000;
    for (let _ = 0; _ < n; _ += 1) {
      sum += randomPoisson(random, undefined);
    }
    const avg = sum / n;
    expect(Math.abs(avg - 1.0) < 0.2).toBe(true);
  });
  it('mean approximates lambda 5', () => {
    const random = createRandomSource(11259375);
    let sum = 0;
    const n = 5000;
    for (let _ = 0; _ < n; _ += 1) {
      sum += randomPoisson(random, 5.0);
    }
    const avg = sum / n;
    expect(Math.abs(avg - 5.0) < 0.5).toBe(true);
  });
  it('throws for lambda zero', () => {
    crate.assertRangeError(() => {
      randomPoisson(createRandomSource(11259375), 0.0);
    }, 'randomPoisson: lambda must be finite and > 0');
  });
  it('throws for negative lambda', () => {
    crate.assertRangeError(() => {
      randomPoisson(createRandomSource(11259375), -1.0);
    }, 'randomPoisson: lambda must be finite and > 0');
  });
  it('rejects nan lambda', () => {
    crate.assertRangeError(() => {
      randomPoisson(createRandomSource(11259375), Number.NaN);
    }, 'randomPoisson: lambda must be finite and > 0');
  });
  it('rejects infinite lambda', () => {
    crate.assertRangeError(() => {
      randomPoisson(createRandomSource(11259375), Number.POSITIVE_INFINITY);
    }, 'randomPoisson: lambda must be finite and > 0');
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomPoisson(a, 3.0)).toEqual(randomPoisson(b, 3.0));
    }
  });
  it('stops when the product exactly reaches the limit', () => {
    const random = crate.sequenceRandom([0.5, 0.5]);
    expect(randomPoisson(random, Math.log(2.0))).toEqual(0);
  });
});

describe('randomWeighted', () => {
  it('returns indices within the weights slice', () => {
    const random = createRandomSource(11259375);
    const weights = [1.0, 2.0, 3.0];
    for (let _ = 0; _ < 100; _ += 1) {
      const idx = randomWeighted(random, weights);
      expect(idx >= 0).toBe(true);
      expect(idx < weights.length).toBe(true);
    }
  });
  it('returns negative 1 for an empty slice', () => {
    expect(randomWeighted(createRandomSource(11259375), [])).toEqual(-1);
  });
  it('returns negative 1 for an all zero weight slice', () => {
    expect(randomWeighted(createRandomSource(11259375), [0.0, 0.0, 0.0])).toEqual(-1);
  });
  it('always returns the only non zero index when all others are zero', () => {
    const random = createRandomSource(11259375);
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomWeighted(random, [0.0, 10.0, 0.0])).toEqual(1);
    }
  });
  it('is deterministic for the same seed', () => {
    const a = createRandomSource(11259375);
    const b = createRandomSource(11259375);
    const weights = [1.0, 2.0, 3.0, 4.0];
    for (let _ = 0; _ < 20; _ += 1) {
      expect(randomWeighted(a, weights)).toEqual(randomWeighted(b, weights));
    }
  });
  it('falls back to the final bucket for an out of range random source', () => {
    expect(randomWeighted(() => 1.1, [1.0, 2.0, 7.0])).toEqual(2);
  });
  it('selects the earlier bucket when the sample lands exactly on its boundary', () => {
    expect(randomWeighted(() => 1.0 / 3.0, [1.0, 2.0])).toEqual(0);
  });
});

describe('shuffle', () => {
  // Rust-only: contains all original elements and reuses caller capacity
  it('clears stale output and fills the same length', () => {
    const items = [1, 2, 3, 4, 5];
    let out = [99, 98, 97, 96, 95, 94];
    shuffle(out, createRandomSource(11259375), items);
    expect(out.length).toEqual(items.length);
    expect(!out.includes(99)).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    let a = [] as never[];
    let b = [] as never[];
    shuffle(a, createRandomSource(11259375), items);
    shuffle(b, createRandomSource(11259375), items);
    expect(a).toEqual(b);
  });
  it('does not mutate the original array', () => {
    const items = [1, 2, 3, 4, 5];
    const original = items;
    shuffle([] as never[], createRandomSource(11259375), items);
    expect(items).toEqual(original);
  });
});

describe('shuffleInPlace', () => {
  it('retains all original elements', () => {
    let items = [1, 2, 3, 4, 5];
    let expected = [...items];
    expected.sort((a, b) => a - b);
    shuffleInPlace(createRandomSource(11259375), items);
    items.sort((a, b) => a - b);
    expect(items).toEqual(expected);
  });
  it('is deterministic for the same seed', () => {
    let a = [1, 2, 3, 4, 5, 6, 7, 8];
    let b = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffleInPlace(createRandomSource(11259375), a);
    shuffleInPlace(createRandomSource(11259375), b);
    expect(a).toEqual(b);
  });
  it('mutates the original array', () => {
    let items = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...items];
    shuffleInPlace(createRandomSource(11259375), items);
    expect(items.length).toEqual(copy.length);
  });
  it('pins the swaps and consumes exactly one sample per fisher yates step', () => {
    const values = [0.75, 0.5, 0.25];
    const calls = { value: 0 };
    const random = () => {
      const index = calls.value;
      calls.value = index + 1;
      return values[index];
    };
    let items = ['a', 'b', 'c', 'd'];
    shuffleInPlace(random, items);
    expect(items).toEqual(['c', 'a', 'b', 'd']);
    expect(calls.value).toEqual(3);
  });
});
