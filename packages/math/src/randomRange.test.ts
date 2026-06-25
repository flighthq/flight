import { createRandomSource } from './random';
import { randomBool, randomInt, randomRange, randomSign } from './randomRange';

const rng = () => createRandomSource(0xabcdef);

describe('randomBool', () => {
  it('returns only booleans', () => {
    const random = rng();
    for (let i = 0; i < 100; i++) {
      const v = randomBool(random);
      expect(typeof v).toBe('boolean');
    }
  });
  it('returns true with probability 1', () => {
    const random = rng();
    for (let i = 0; i < 10; i++) expect(randomBool(random, 1)).toBe(true);
  });
  it('returns false with probability 0', () => {
    const random = rng();
    for (let i = 0; i < 10; i++) expect(randomBool(random, 0)).toBe(false);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomBool(a)).toBe(randomBool(b));
  });
});

describe('randomInt', () => {
  it('returns integers within [min, max]', () => {
    const random = rng();
    for (let i = 0; i < 200; i++) {
      const v = randomInt(random, 0, 9);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
  it('returns min when min equals max', () => {
    const random = rng();
    expect(randomInt(random, 5, 5)).toBe(5);
  });
  it('throws when min > max', () => {
    const random = rng();
    expect(() => randomInt(random, 10, 5)).toThrow(RangeError);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomInt(a, 0, 100)).toBe(randomInt(b, 0, 100));
  });
});

describe('randomRange', () => {
  it('returns values within [min, max)', () => {
    const random = rng();
    for (let i = 0; i < 200; i++) {
      const v = randomRange(random, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
  it('returns min when min equals max', () => {
    const random = rng();
    expect(randomRange(random, 3, 3)).toBe(3);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomRange(a, 0, 100)).toBe(randomRange(b, 0, 100));
  });
});

describe('randomSign', () => {
  it('returns only 1 or -1', () => {
    const random = rng();
    for (let i = 0; i < 100; i++) {
      const v = randomSign(random);
      expect(v === 1 || v === -1).toBe(true);
    }
  });
  it('produces both signs', () => {
    const random = rng();
    let sawPositive = false;
    let sawNegative = false;
    for (let i = 0; i < 100; i++) {
      const v = randomSign(random);
      if (v === 1) sawPositive = true;
      if (v === -1) sawNegative = true;
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });
  it('is deterministic for the same seed', () => {
    const a = rng();
    const b = rng();
    for (let i = 0; i < 20; i++) expect(randomSign(a)).toBe(randomSign(b));
  });
});
