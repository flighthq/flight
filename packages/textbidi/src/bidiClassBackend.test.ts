import type { BidiClassBackend } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCompactBidiClassBackend,
  explainBidiClassBackend,
  getBidiClassBackend,
  initializeCompactBidiClassBackend,
  setBidiClassBackend,
} from './bidiClassBackend';
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

describe('explainBidiClassBackend', () => {
  it('describes the compact fallback and proves its flattened table invariants', () => {
    const explanation = explainBidiClassBackend(createCompactBidiClassBackend());
    expect(explanation.backend).toBe('compact');
    expect(explanation.coverage).toBe('common-script-ranges');
    expect(explanation.fallbackClass).toBe('L');
    expect(explanation.tableValid).toBe(true);
    for (let i = 0; i < explanation.coveredCodePointRanges.length; i++) {
      const range = explanation.coveredCodePointRanges[i];
      expect(range.start).toBeLessThanOrEqual(range.end);
      if (i > 0) expect(range.start).toBeGreaterThan(explanation.coveredCodePointRanges[i - 1].end);
    }
  });

  it('does not claim a custom provider coverage boundary', () => {
    const custom: BidiClassBackend = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' };
    const explanation = explainBidiClassBackend(custom);
    expect(explanation).toEqual({
      backend: 'custom',
      coverage: 'provider-defined',
      coveredCodePointRanges: [],
      fallbackClass: null,
      tableValid: null,
    });
  });
});

describe('getBidiClassBackend', () => {
  it('lazily creates the compact default on first access', () => {
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('L');
  });
});

describe('initializeCompactBidiClassBackend', () => {
  it('is the construction initializer of createCompactBidiClassBackend', () => {
    expect(typeof initializeCompactBidiClassBackend).toBe('function');
  });
});
describe('setBidiClassBackend', () => {
  it('routes resolveBidiLevels class lookups through the installed backend', () => {
    // A fake backend that reports every character as strong R forces the whole string to level 1.
    const fake: BidiClassBackend = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' };
    setBidiClassBackend(fake);
    expect(Array.from(resolveBidiLevels('abc', 'ltr'))).toEqual([1, 1, 1]);
  });

  it('restores the compact default when passed null', () => {
    setBidiClassBackend({ [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' });
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('R');
    setBidiClassBackend(null);
    expect(getBidiClassBackend().getBidiClass('a'.codePointAt(0) as number)).toBe('L');
  });
});
