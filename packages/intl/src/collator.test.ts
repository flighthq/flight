import { describe, expect, it } from 'vitest';

import { compareStrings, sortStrings } from './collator';

describe('compareStrings', () => {
  it('orders a before b in en-US', () => {
    expect(compareStrings('a', 'b', 'en-US')).toBeLessThan(0);
    expect(compareStrings('b', 'a', 'en-US')).toBeGreaterThan(0);
  });
});

describe('sortStrings', () => {
  it('returns a new sorted array in en-US', () => {
    expect(sortStrings(['b', 'a', 'c'], 'en-US')).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = ['b', 'a', 'c'];
    sortStrings(input, 'en-US');
    expect(input).toEqual(['b', 'a', 'c']);
  });
});
