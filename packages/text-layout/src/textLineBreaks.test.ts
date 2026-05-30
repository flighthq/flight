import { describe, expect, it } from 'vitest';

import { getLineBreakIndex, getLineBreaks } from './textLineBreaks';

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

describe('getLineBreaks', () => {
  const out: number[] = [];

  it('returns empty array for text with no line breaks', () => {
    getLineBreaks(out, 'hello world');
    expect(out).toEqual([]);
  });

  it('finds LF positions', () => {
    getLineBreaks(out, 'a\nb\nc');
    expect(out).toEqual([1, 3]);
  });

  it('finds CR positions', () => {
    getLineBreaks(out, 'a\rb\rc');
    expect(out).toEqual([1, 3]);
  });

  it('prefers the earlier of CR and LF when both are present', () => {
    getLineBreaks(out, 'a\nb\rc');
    expect(out).toEqual([1, 3]);
    getLineBreaks(out, 'a\rb\nc');
    expect(out).toEqual([1, 3]);
  });

  it('handles trailing newline', () => {
    getLineBreaks(out, 'ab\n');
    expect(out).toEqual([2]);
  });

  it('returns empty array for empty text', () => {
    getLineBreaks(out, '');
    expect(out).toEqual([]);
  });
});
