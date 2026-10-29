import { describe, expect, it } from 'vitest';

import { findUtf16Unit, jsMax, jsMin, utf16CodePointLen, utf16Slice } from './textUnits.ts';

describe('findUtf16Unit', () => {
  it('searches from the requested offset', () => {
    const units = [0x0061, 0x000a, 0x0062, 0x000a];
    expect(findUtf16Unit(units, 0x000a, 0)).toBe(1);
    expect(findUtf16Unit(units, 0x000a, 2)).toBe(3);
    expect(findUtf16Unit(units, 0x000d, 0)).toBeUndefined();
  });
});

describe('jsMax', () => {
  it('preserves JavaScript maximum and NaN behavior', () => {
    expect(jsMax(-2, 4)).toBe(4);
    expect(jsMax(Number.NaN, 4)).toBeNaN();
  });
});

describe('jsMin', () => {
  it('preserves JavaScript minimum and NaN behavior', () => {
    expect(jsMin(-2, 4)).toBe(-2);
    expect(jsMin(-2, Number.NaN)).toBeNaN();
  });
});

describe('utf16CodePointLen', () => {
  it('counts a surrogate pair as two code units', () => {
    const units = [0x0061, 0xd83d, 0xde80, 0x0062];
    expect(utf16CodePointLen(units, 0)).toBe(1);
    expect(utf16CodePointLen(units, 1)).toBe(2);
  });
});

describe('utf16Slice', () => {
  it('reconstructs astral characters from complete surrogate pairs', () => {
    expect(utf16Slice([0x0061, 0xd83d, 0xde80, 0x0062], 1, 3)).toBe('🚀');
  });
});
