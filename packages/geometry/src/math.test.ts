import { nextPowerOfTwo } from './math';

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
