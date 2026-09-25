import type { BidiClassKernel } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { compactBidiClassKernel } from './bidiClassKernel.ts';
import { getBidiRuns } from './getBidiRuns.ts';

const kernel = compactBidiClassKernel;

const LEFT_TO_RIGHT_BACKEND: BidiClassKernel = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'L' };
const RIGHT_TO_LEFT_BACKEND: BidiClassKernel = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' };

const HEBREW = 'שלום';

// Arabic letters (bidi class AL).
const ARABIC = 'ابتثج';

// Bidi control characters.
const LRE = '‪';
const RLE = '‫';
const PDF = '‬';

describe('getBidiRuns', () => {
  it('routes class lookups through an explicit kernel', () => {
    expect(getBidiRuns(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr')).toEqual([
      { start: 0, end: 3, level: 1, direction: 'rtl' },
    ]);
  });

  it('isolates interleaved callers that pass different backends', () => {
    expect(getBidiRuns(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr')).toEqual([
      { start: 0, end: 3, level: 1, direction: 'rtl' },
    ]);
    expect(getBidiRuns(LEFT_TO_RIGHT_BACKEND, 'abc', 'ltr')).toEqual([
      { start: 0, end: 3, level: 0, direction: 'ltr' },
    ]);
    expect(getBidiRuns(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr')).toEqual([
      { start: 0, end: 3, level: 1, direction: 'rtl' },
    ]);
  });

  it('produces distinct level runs for Arabic text with embedded European numbers', () => {
    const runs = getBidiRuns(kernel, `${ARABIC} 123 ${ARABIC}`, 'auto');
    expect(runs).toEqual([
      { start: 0, end: 6, level: 1, direction: 'rtl' },
      { start: 6, end: 9, level: 2, direction: 'ltr' },
      { start: 9, end: 15, level: 1, direction: 'rtl' },
    ]);
  });

  it('produces distinct runs from an explicit RLE embedding in an LTR paragraph', () => {
    const text = `ab${RLE}${HEBREW}${PDF}cd`;
    const runs = getBidiRuns(kernel, text, 'auto');
    expect(runs).toEqual([
      { start: 0, end: 3, level: 0, direction: 'ltr' },
      { start: 3, end: 7, level: 1, direction: 'rtl' },
      { start: 7, end: 10, level: 0, direction: 'ltr' },
    ]);
  });

  it('produces distinct runs from an explicit LRE embedding in an RTL paragraph', () => {
    const text = `${HEBREW}${LRE}ab${PDF}${HEBREW}`;
    const runs = getBidiRuns(kernel, text, 'auto');
    expect(runs).toEqual([
      { start: 0, end: 5, level: 1, direction: 'rtl' },
      { start: 5, end: 7, level: 2, direction: 'ltr' },
      { start: 7, end: 12, level: 1, direction: 'rtl' },
    ]);
  });

  it('returns a single rtl run for pure-RTL text', () => {
    expect(getBidiRuns(kernel, ARABIC, 'auto')).toEqual([{ start: 0, end: 5, level: 1, direction: 'rtl' }]);
  });

  it('returns a single ltr run for pure-LTR text', () => {
    expect(getBidiRuns(kernel, 'hello', 'auto')).toEqual([{ start: 0, end: 5, level: 0, direction: 'ltr' }]);
  });

  it('returns no runs for empty text', () => {
    expect(getBidiRuns(kernel, '', 'auto')).toEqual([]);
  });

  it('splits a mixed string into ltr / rtl / ltr runs with correct ranges', () => {
    expect(getBidiRuns(kernel, `hello ${HEBREW} world`, 'auto')).toEqual([
      { start: 0, end: 6, level: 0, direction: 'ltr' },
      { start: 6, end: 10, level: 1, direction: 'rtl' },
      { start: 10, end: 16, level: 0, direction: 'ltr' },
    ]);
  });
});
