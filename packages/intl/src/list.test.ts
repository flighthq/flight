import { describe, expect, it } from 'vitest';

import { formatList } from './list';

describe('formatList', () => {
  it('joins items as an en-US conjunction list', () => {
    expect(formatList(['a', 'b', 'c'], 'en-US')).toBe('a, b, and c');
  });

  it('joins items as a disjunction list when asked', () => {
    expect(formatList(['a', 'b', 'c'], 'en-US', { type: 'disjunction' })).toBe('a, b, or c');
  });
});
