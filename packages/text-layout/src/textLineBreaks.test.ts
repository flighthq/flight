import { describe, expect, it } from 'vitest';

import { getLineBreakIndex, getLineBreaks } from './textLineBreaks';

describe('getLineBreaks', () => {
  it('returns empty array for text with no line breaks', () => {
    expect(getLineBreaks('hello world')).toEqual([]);
  });

  it('finds LF positions', () => {
    expect(getLineBreaks('a\nb\nc')).toEqual([1, 3]);
  });

  it('finds CR positions', () => {
    expect(getLineBreaks('a\rb\rc')).toEqual([1, 3]);
  });

  it('prefers the earlier of CR and LF when both are present', () => {
    expect(getLineBreaks('a\nb\rc')).toEqual([1, 3]);
    expect(getLineBreaks('a\rb\nc')).toEqual([1, 3]);
  });

  it('handles trailing newline', () => {
    expect(getLineBreaks('ab\n')).toEqual([2]);
  });

  it('returns empty array for empty text', () => {
    expect(getLineBreaks('')).toEqual([]);
  });
});

describe('getLineBreakIndex', () => {
  it('returns the first break at or after startIndex', () => {
    expect(getLineBreakIndex([3, 7, 12], 5)).toBe(7);
  });

  it('returns the first break when startIndex is 0', () => {
    expect(getLineBreakIndex([3, 7], 0)).toBe(3);
  });

  it('returns -1 when no break is at or after startIndex', () => {
    expect(getLineBreakIndex([3, 7], 10)).toBe(-1);
  });

  it('returns -1 for empty break list', () => {
    expect(getLineBreakIndex([], 0)).toBe(-1);
  });
});
