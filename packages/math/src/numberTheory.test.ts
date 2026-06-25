import { factorial, gcd, hypot2, isEven, isOdd, lcm } from './numberTheory';

describe('factorial', () => {
  it('returns 1 for 0', () => {
    expect(factorial(0)).toBe(1);
  });
  it('returns 1 for 1', () => {
    expect(factorial(1)).toBe(1);
  });
  it('computes common factorials', () => {
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
  });
  it('throws for negative integers', () => {
    expect(() => factorial(-1)).toThrow(RangeError);
  });
  it('throws for non-integers', () => {
    expect(() => factorial(1.5)).toThrow(RangeError);
  });
});

describe('gcd', () => {
  it('returns the gcd of two positive integers', () => {
    expect(gcd(12, 8)).toBe(4);
    expect(gcd(100, 75)).toBe(25);
  });
  it('returns the larger number when one is a multiple of the other', () => {
    expect(gcd(6, 3)).toBe(3);
  });
  it('returns 1 for coprime numbers', () => {
    expect(gcd(7, 13)).toBe(1);
  });
  it('accepts negative inputs', () => {
    expect(gcd(-12, 8)).toBe(4);
  });
  it('accepts zero as one argument', () => {
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(7, 0)).toBe(7);
  });
  it('throws when both arguments are 0', () => {
    expect(() => gcd(0, 0)).toThrow(RangeError);
  });
});

describe('hypot2', () => {
  it('returns x squared plus y squared', () => {
    expect(hypot2(3, 4)).toBe(25);
  });
  it('returns 0 for zero inputs', () => {
    expect(hypot2(0, 0)).toBe(0);
  });
  it('matches Math.hypot squared', () => {
    const h = Math.hypot(5, 12);
    expect(hypot2(5, 12)).toBeCloseTo(h * h, 10);
  });
});

describe('isEven', () => {
  it('returns true for even numbers', () => {
    expect(isEven(0)).toBe(true);
    expect(isEven(2)).toBe(true);
    expect(isEven(100)).toBe(true);
  });
  it('returns false for odd numbers', () => {
    expect(isEven(1)).toBe(false);
    expect(isEven(3)).toBe(false);
    expect(isEven(99)).toBe(false);
  });
});

describe('isOdd', () => {
  it('returns true for odd numbers', () => {
    expect(isOdd(1)).toBe(true);
    expect(isOdd(3)).toBe(true);
    expect(isOdd(99)).toBe(true);
  });
  it('returns false for even numbers', () => {
    expect(isOdd(0)).toBe(false);
    expect(isOdd(2)).toBe(false);
    expect(isOdd(100)).toBe(false);
  });
});

describe('lcm', () => {
  it('returns the lcm of two positive integers', () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(3, 5)).toBe(15);
  });
  it('returns the larger number when one is a multiple of the other', () => {
    expect(lcm(4, 8)).toBe(8);
  });
  it('accepts negative inputs', () => {
    expect(lcm(-4, 6)).toBe(12);
  });
});
