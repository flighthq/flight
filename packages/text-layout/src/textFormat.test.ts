import { describe, expect, it } from 'vitest';

import {
  getTextFormatAscent,
  getTextFormatDescent,
  getTextFormatHeight,
  getTextFormatLeading,
  mergeTextFormat,
} from './textFormat';

describe('getTextFormatAscent', () => {
  it('returns size when specified', () => {
    expect(getTextFormatAscent({ size: 24 })).toBe(24);
  });

  it('returns 12 when size is absent', () => {
    expect(getTextFormatAscent({})).toBe(12);
  });
});

describe('getTextFormatDescent', () => {
  it('returns 18.5% of size', () => {
    expect(getTextFormatDescent({ size: 100 })).toBeCloseTo(18.5);
  });

  it('uses default size of 12 when absent', () => {
    expect(getTextFormatDescent({})).toBeCloseTo(12 * 0.185);
  });
});

describe('getTextFormatHeight', () => {
  it('sums ascent, descent and leading', () => {
    expect(getTextFormatHeight({ size: 10, leading: 4 })).toBeCloseTo(10 + 10 * 0.185 + 4);
  });

  it('treats absent leading as zero', () => {
    expect(getTextFormatHeight({ size: 10 })).toBeCloseTo(10 + 10 * 0.185);
  });
});

describe('getTextFormatLeading', () => {
  it('returns leading when specified', () => {
    expect(getTextFormatLeading({ leading: 6 })).toBe(6);
  });

  it('returns 0 when absent', () => {
    expect(getTextFormatLeading({})).toBe(0);
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
