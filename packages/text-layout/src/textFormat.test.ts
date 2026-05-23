import { describe, expect, it } from 'vitest';

import { getFormatAscent, getFormatDescent, getFormatHeight, getFormatLeading, mergeTextFormat } from './textFormat';

describe('getFormatAscent', () => {
  it('returns size when specified', () => {
    expect(getFormatAscent({ size: 24 })).toBe(24);
  });

  it('returns 12 when size is absent', () => {
    expect(getFormatAscent({})).toBe(12);
  });
});

describe('getFormatDescent', () => {
  it('returns 18.5% of size', () => {
    expect(getFormatDescent({ size: 100 })).toBeCloseTo(18.5);
  });

  it('uses default size of 12 when absent', () => {
    expect(getFormatDescent({})).toBeCloseTo(12 * 0.185);
  });
});

describe('getFormatHeight', () => {
  it('sums ascent, descent and leading', () => {
    expect(getFormatHeight({ size: 10, leading: 4 })).toBeCloseTo(10 + 10 * 0.185 + 4);
  });

  it('treats absent leading as zero', () => {
    expect(getFormatHeight({ size: 10 })).toBeCloseTo(10 + 10 * 0.185);
  });
});

describe('getFormatLeading', () => {
  it('returns leading when specified', () => {
    expect(getFormatLeading({ leading: 6 })).toBe(6);
  });

  it('returns 0 when absent', () => {
    expect(getFormatLeading({})).toBe(0);
  });
});

describe('mergeTextFormat', () => {
  it('applies non-null override fields onto base', () => {
    const result = mergeTextFormat({ size: 12, bold: false }, { bold: true, color: 0xff0000 });
    expect(result).toMatchObject({ size: 12, bold: true, color: 0xff0000 });
  });

  it('skips null and undefined override fields', () => {
    const result = mergeTextFormat({ size: 12 }, { size: undefined, bold: undefined });
    expect(result.size).toBe(12);
    expect(result.bold).toBeUndefined();
  });

  it('does not mutate the base object', () => {
    const base = { size: 12 };
    mergeTextFormat(base, { size: 24 });
    expect(base.size).toBe(12);
  });
});
