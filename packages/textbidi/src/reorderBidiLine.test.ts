import { describe, expect, it } from 'vitest';

import { reorderBidiLine } from './reorderBidiLine';

describe('reorderBidiLine', () => {
  it('reverses a pure-RTL run to visual order', () => {
    const levels = new Uint8Array([1, 1, 1]);
    const out: number[] = [];
    reorderBidiLine(levels, 0, 3, out);
    expect(out).toEqual([2, 1, 0]);
  });

  it('leaves a pure-LTR line in logical order', () => {
    const levels = new Uint8Array([0, 0, 0, 0]);
    const out: number[] = [];
    reorderBidiLine(levels, 0, 4, out);
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it('reorders only the RTL run of a mixed line', () => {
    // Levels of "hello שלום world": the level-1 Hebrew run (indices 6..9) reverses; the rest stays.
    const levels = new Uint8Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    const out: number[] = [];
    reorderBidiLine(levels, 0, levels.length, out);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 9, 8, 7, 6, 10, 11, 12, 13, 14, 15]);
  });

  it('reorders numbers nested in RTL text (level 2 within level 1) correctly', () => {
    // "שלום 123": Hebrew+space at level 1, digits at level 2. Visually the whole line is RTL, but the
    // digits keep their internal LTR order — L2 reverses level ≥ 2 then level ≥ 1.
    const levels = new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2]);
    const out: number[] = [];
    reorderBidiLine(levels, 0, 8, out);
    expect(out).toEqual([5, 6, 7, 4, 3, 2, 1, 0]);
  });

  it('writes into a distinct out array and can reuse one across calls', () => {
    const out: number[] = [];
    reorderBidiLine(new Uint8Array([1, 1]), 0, 2, out);
    expect(out).toEqual([1, 0]);
    // Reusing the same array on a shorter line truncates it — no fresh allocation required.
    reorderBidiLine(new Uint8Array([0]), 0, 1, out);
    expect(out).toEqual([0]);
  });

  it('reorders a sub-range within a larger level buffer', () => {
    const levels = new Uint8Array([0, 1, 1, 1, 0]);
    const out: number[] = [];
    reorderBidiLine(levels, 1, 4, out);
    expect(out).toEqual([3, 2, 1]);
  });
});
