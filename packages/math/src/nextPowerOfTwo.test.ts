import { isPowerOfTwo, nextMultipleOf, nextPowerOfTwo, previousPowerOfTwo } from './nextPowerOfTwo';

describe('isPowerOfTwo', () => {
  it('returns true for powers of two', () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(4)).toBe(true);
    expect(isPowerOfTwo(64)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
  });
  it('returns false for non-powers of two', () => {
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(5)).toBe(false);
    expect(isPowerOfTwo(100)).toBe(false);
  });
  it('returns false for 0', () => {
    expect(isPowerOfTwo(0)).toBe(false);
  });
  it('returns false for negative numbers', () => {
    expect(isPowerOfTwo(-1)).toBe(false);
    expect(isPowerOfTwo(-4)).toBe(false);
  });
});

describe('nextMultipleOf', () => {
  it('rounds up to the next multiple', () => {
    expect(nextMultipleOf(7, 4)).toBe(8);
  });
  it('leaves an exact multiple unchanged', () => {
    expect(nextMultipleOf(8, 4)).toBe(8);
  });
  it('returns value when multiple is 0', () => {
    expect(nextMultipleOf(7, 0)).toBe(7);
  });
  it('works with small values', () => {
    expect(nextMultipleOf(1, 16)).toBe(16);
    expect(nextMultipleOf(0, 4)).toBe(0);
  });
});

describe('nextPowerOfTwo', () => {
  it('returns 1 for 0', () => {
    expect(nextPowerOfTwo(0)).toBe(1);
  });
  it('returns 1 for 1', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
  });
  it('returns an exact power of two unchanged', () => {
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(64)).toBe(64);
    expect(nextPowerOfTwo(128)).toBe(128);
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });
  it('rounds up to the next power of two', () => {
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(100)).toBe(128);
    expect(nextPowerOfTwo(129)).toBe(256);
    expect(nextPowerOfTwo(1000)).toBe(1024);
  });
  it('handles negative numbers', () => {
    expect(nextPowerOfTwo(-1)).toBe(1);
  });
});

describe('previousPowerOfTwo', () => {
  it('returns 1 for 1', () => {
    expect(previousPowerOfTwo(1)).toBe(1);
  });
  it('returns 1 for values <= 1', () => {
    expect(previousPowerOfTwo(0)).toBe(1);
    expect(previousPowerOfTwo(-1)).toBe(1);
  });
  it('returns an exact power of two unchanged', () => {
    expect(previousPowerOfTwo(4)).toBe(4);
    expect(previousPowerOfTwo(64)).toBe(64);
  });
  it('rounds down to the previous power of two', () => {
    expect(previousPowerOfTwo(6)).toBe(4);
    expect(previousPowerOfTwo(100)).toBe(64);
    expect(previousPowerOfTwo(200)).toBe(128);
    expect(previousPowerOfTwo(1025)).toBe(1024);
  });
});
