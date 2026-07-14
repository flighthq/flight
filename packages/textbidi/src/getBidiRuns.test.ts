import { describe, expect, it } from 'vitest';

import { getBidiRuns } from './getBidiRuns';

const HEBREW = 'שלום';

// Arabic letters (bidi class AL).
const ARABIC = 'ابتثج';

// Bidi control characters.
const LRE = '‪';
const RLE = '‫';
const PDF = '‬';

describe('getBidiRuns', () => {
  it('produces distinct level runs for Arabic text with embedded European numbers', () => {
    // RTL paragraph (Arabic leads). Arabic at level 1. European digits: W2 converts EN after AL
    // to AN, I2 bumps AN to level 2. This creates an RTL run, an LTR run for the digits, and
    // another RTL run.
    // ابتثج 123 ابتثج → Arabic(1) space(1) digits(2) space(1) Arabic(1)
    const runs = getBidiRuns(`${ARABIC} 123 ${ARABIC}`, 'auto');
    expect(runs).toEqual([
      { start: 0, end: 6, level: 1, direction: 'rtl' },
      { start: 6, end: 9, level: 2, direction: 'ltr' },
      { start: 9, end: 15, level: 1, direction: 'rtl' },
    ]);
  });

  it('produces distinct runs from an explicit RLE embedding in an LTR paragraph', () => {
    // LTR paragraph. RLE pushes next-odd = 1. Embedded Hebrew gets level 1. PDF pops.
    // "ab" + RLE + שלום + PDF + "cd"
    const text = `ab${RLE}${HEBREW}${PDF}cd`;
    const runs = getBidiRuns(text, 'auto');
    // ab(0) + RLE(0) = run level 0. Then שלום at level 1 = RTL run. Then PDF(0) + cd(0) = run level 0.
    expect(runs).toEqual([
      { start: 0, end: 3, level: 0, direction: 'ltr' },
      { start: 3, end: 7, level: 1, direction: 'rtl' },
      { start: 7, end: 10, level: 0, direction: 'ltr' },
    ]);
  });

  it('produces distinct runs from an explicit LRE embedding in an RTL paragraph', () => {
    // RTL paragraph. LRE pushes next-even above 1 = 2. Embedded Latin gets level 2. PDF pops.
    // שלום + LRE + "ab" + PDF + שלום
    const text = `${HEBREW}${LRE}ab${PDF}${HEBREW}`;
    const runs = getBidiRuns(text, 'auto');
    // שלום(1) + LRE(1) = run level 1. Then "ab" at level 2 = LTR run. Then PDF(1) + שלום(1) = run level 1.
    expect(runs).toEqual([
      { start: 0, end: 5, level: 1, direction: 'rtl' },
      { start: 5, end: 7, level: 2, direction: 'ltr' },
      { start: 7, end: 12, level: 1, direction: 'rtl' },
    ]);
  });

  it('returns a single rtl run for pure-RTL text', () => {
    expect(getBidiRuns(ARABIC, 'auto')).toEqual([{ start: 0, end: 5, level: 1, direction: 'rtl' }]);
  });

  it('returns a single ltr run for pure-LTR text', () => {
    expect(getBidiRuns('hello', 'auto')).toEqual([{ start: 0, end: 5, level: 0, direction: 'ltr' }]);
  });

  it('returns no runs for empty text', () => {
    expect(getBidiRuns('', 'auto')).toEqual([]);
  });

  it('splits a mixed string into ltr / rtl / ltr runs with correct ranges', () => {
    // "hello שלום world" — the joining spaces stay at level 0, so they attach to the Latin runs.
    expect(getBidiRuns(`hello ${HEBREW} world`, 'auto')).toEqual([
      { start: 0, end: 6, level: 0, direction: 'ltr' },
      { start: 6, end: 10, level: 1, direction: 'rtl' },
      { start: 10, end: 16, level: 0, direction: 'ltr' },
    ]);
  });
});
