import type { BidiClassBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createCompactBidiClassBackend, getBidiClassBackend, setBidiClassBackend } from './bidiClassBackend';
import { resolveBidiLevels } from './resolveBidiLevels';

afterEach(() => {
  setBidiClassBackend(null);
});

describe('createCompactBidiClassBackend', () => {
  it('classifies a representative sample of common-script codepoints', () => {
    const backend = createCompactBidiClassBackend();
    expect(backend.getBidiClass('a'.codePointAt(0) as number)).toBe('L');
    expect(backend.getBidiClass('Z'.codePointAt(0) as number)).toBe('L');
    expect(backend.getBidiClass(0x05d0)).toBe('R'); // Hebrew alef
    expect(backend.getBidiClass(0x0627)).toBe('AL'); // Arabic alef
    expect(backend.getBidiClass('5'.codePointAt(0) as number)).toBe('EN');
    expect(backend.getBidiClass(0x0660)).toBe('AN'); // Arabic-Indic digit zero
    expect(backend.getBidiClass(' '.codePointAt(0) as number)).toBe('WS');
    expect(backend.getBidiClass(0x0301)).toBe('NSM'); // combining acute accent
    expect(backend.getBidiClass(0x2066)).toBe('LRI');
    expect(backend.getBidiClass(0x2069)).toBe('PDI');
    expect(backend.getBidiClass(0x202b)).toBe('RLE');
  });

  it('resolves uncovered codepoints to the LTR default', () => {
    const backend = createCompactBidiClassBackend();
    expect(backend.getBidiClass(0x4e2d)).toBe('L'); // CJK ideograph, outside the compact table
  });
});

describe('getBidiClassBackend', () => {
  it('lazily creates the compact default on first access', () => {
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('L');
  });
});

describe('setBidiClassBackend', () => {
  it('routes resolveBidiLevels class lookups through the installed backend', () => {
    // A fake backend that reports every character as strong R forces the whole string to level 1.
    const fake: BidiClassBackend = { getBidiClass: () => 'R' };
    setBidiClassBackend(fake);
    expect(Array.from(resolveBidiLevels('abc', 'ltr'))).toEqual([1, 1, 1]);
  });

  it('restores the compact default when passed null', () => {
    setBidiClassBackend({ getBidiClass: () => 'R' });
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('R');
    setBidiClassBackend(null);
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('L');
  });
});
