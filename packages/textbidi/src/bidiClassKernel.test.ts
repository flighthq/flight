import type { BidiClassKernel } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createCompactBidiClassKernel,
  compactBidiClassKernel,
  explainBidiClassKernel,
  initializeCompactBidiClassKernel,
} from './bidiClassKernel';

describe('compactBidiClassKernel', () => {
  it('is the shared kernel the bidi operations are handed', () => {
    expect(compactBidiClassKernel.getBidiClass('a'.codePointAt(0) as number)).toBe('L');
  });
});

describe('createCompactBidiClassKernel', () => {
  it('classifies a representative sample of common-script codepoints', () => {
    const kernel = createCompactBidiClassKernel();
    expect(kernel.getBidiClass('a'.codePointAt(0) as number)).toBe('L');
    expect(kernel.getBidiClass('Z'.codePointAt(0) as number)).toBe('L');
    expect(kernel.getBidiClass(0x05d0)).toBe('R'); // Hebrew alef
    expect(kernel.getBidiClass(0x0627)).toBe('AL'); // Arabic alef
    expect(kernel.getBidiClass('5'.codePointAt(0) as number)).toBe('EN');
    expect(kernel.getBidiClass(0x0660)).toBe('AN'); // Arabic-Indic digit zero
    expect(kernel.getBidiClass(' '.codePointAt(0) as number)).toBe('WS');
    expect(kernel.getBidiClass(0x0301)).toBe('NSM'); // combining acute accent
    expect(kernel.getBidiClass(0x2066)).toBe('LRI');
    expect(kernel.getBidiClass(0x2069)).toBe('PDI');
    expect(kernel.getBidiClass(0x202b)).toBe('RLE');
  });

  it('resolves uncovered codepoints to the LTR default', () => {
    const kernel = createCompactBidiClassKernel();
    expect(kernel.getBidiClass(0x4e2d)).toBe('L'); // CJK ideograph, outside the compact table
  });
});

describe('explainBidiClassKernel', () => {
  it('describes the compact fallback and proves its flattened table invariants', () => {
    const explanation = explainBidiClassKernel(createCompactBidiClassKernel());
    expect(explanation.kernel).toBe('compact');
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
    const custom: BidiClassKernel = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' };
    const explanation = explainBidiClassKernel(custom);
    expect(explanation).toEqual({
      kernel: 'custom',
      coverage: 'provider-defined',
      coveredCodePointRanges: [],
      fallbackClass: null,
      tableValid: null,
    });
  });
});

describe('initializeCompactBidiClassKernel', () => {
  it('is the construction initializer of createCompactBidiClassKernel', () => {
    expect(typeof initializeCompactBidiClassKernel).toBe('function');
  });
});
