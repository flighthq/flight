import { describe, expect, it } from 'vitest';

import { getTextLineBreakIndex, getTextLineBreaks } from './textLineBreaks';

describe('getTextLineBreakIndex', () => {
  it('returns the first break at or after startIndex', () => {
    expect(getTextLineBreakIndex([3, 7, 12], 5)).toBe(7);
  });

  it('returns the first break when startIndex is 0', () => {
    expect(getTextLineBreakIndex([3, 7], 0)).toBe(3);
  });

  it('returns -1 when no break is at or after startIndex', () => {
    expect(getTextLineBreakIndex([3, 7], 10)).toBe(-1);
  });

  it('returns -1 for empty break list', () => {
    expect(getTextLineBreakIndex([], 0)).toBe(-1);
  });
});

describe('getTextLineBreaks', () => {
  const out: number[] = [];

  it('returns empty array for text with no line breaks', () => {
    getTextLineBreaks(out, 'hello world');
    expect(out).toEqual([]);
  });

  it('finds LF positions', () => {
    getTextLineBreaks(out, 'a\nb\nc');
    expect(out).toEqual([1, 3]);
  });

  it('finds CR positions', () => {
    getTextLineBreaks(out, 'a\rb\rc');
    expect(out).toEqual([1, 3]);
  });

  it('prefers the earlier of CR and LF when both are present', () => {
    getTextLineBreaks(out, 'a\nb\rc');
    expect(out).toEqual([1, 3]);
    getTextLineBreaks(out, 'a\rb\nc');
    expect(out).toEqual([1, 3]);
  });

  it('handles trailing newline', () => {
    getTextLineBreaks(out, 'ab\n');
    expect(out).toEqual([2]);
  });

  it('returns empty array for empty text', () => {
    getTextLineBreaks(out, '');
    expect(out).toEqual([]);
  });
});
