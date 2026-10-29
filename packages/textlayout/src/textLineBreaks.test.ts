// Generated from crates/flight-textlayout/tests/text_line_breaks_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { getTextLineBreakIndex, getTextLineBreaks } from './contract.ts';

describe('getTextLineBreakIndex', () => {
  it('correctly finds the first break in a large sorted array', () => {
    const breaks: number[] = Array.from({ length: 100 - 0 }, (_, index) => 0 + index).map((index) => index * 10);
    expect(getTextLineBreakIndex(breaks, 55)).toEqual(60);
    expect(getTextLineBreakIndex(breaks, 60)).toEqual(60);
    expect(getTextLineBreakIndex(breaks, 0)).toEqual(0);
    expect(getTextLineBreakIndex(breaks, 999)).toEqual(-1);
  });
  it('returns an exact match when start index equals a break', () => {
    expect(getTextLineBreakIndex([3, 7, 12], 7)).toEqual(7);
  });
  it('returns minus one for empty break list', () => {
    expect(getTextLineBreakIndex([], 0)).toEqual(-1);
  });
  it('returns minus one when no break is at or after start index', () => {
    expect(getTextLineBreakIndex([3, 7], 10)).toEqual(-1);
  });
  it('returns the first break at or after start index', () => {
    expect(getTextLineBreakIndex([3, 7, 12], 5)).toEqual(7);
  });
  it('returns the first break when start index is 0', () => {
    expect(getTextLineBreakIndex([3, 7], undefined)).toEqual(3);
  });
  it('works correctly with a single element array', () => {
    expect(getTextLineBreakIndex([5], 3)).toEqual(5);
    expect(getTextLineBreakIndex([5], 5)).toEqual(5);
    expect(getTextLineBreakIndex([5], 6)).toEqual(-1);
  });
});

describe('getTextLineBreaks', () => {
  it('finds cr positions', () => {
    let out = [] as never[];
    getTextLineBreaks(out, 'a\rb\rc');
    expect(out).toEqual([1, 3]);
  });
  it('finds lf positions', () => {
    let out = [] as never[];
    getTextLineBreaks(out, 'a\nb\nc');
    expect(out).toEqual([1, 3]);
  });
  it('handles trailing newline', () => {
    let out = [] as never[];
    getTextLineBreaks(out, 'ab\n');
    expect(out).toEqual([2]);
  });
  it('prefers the earlier of cr and lf when both are present', () => {
    let out = [] as never[];
    getTextLineBreaks(out, 'a\nb\rc');
    expect(out).toEqual([1, 3]);
    getTextLineBreaks(out, 'a\rb\nc');
    expect(out).toEqual([1, 3]);
  });
  it('returns empty array for empty text', () => {
    let out = [1];
    getTextLineBreaks(out, '');
    expect(out.length === 0).toBe(true);
  });
  it('returns empty array for text with no line breaks', () => {
    let out = [1];
    getTextLineBreaks(out, 'hello world');
    expect(out.length === 0).toBe(true);
  });
});
