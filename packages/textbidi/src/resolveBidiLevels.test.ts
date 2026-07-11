import { describe, expect, it } from 'vitest';

import { resolveBidiLevels } from './resolveBidiLevels';

// "שלום" — the Hebrew word (four strong-R letters).
const HEBREW = 'שלום';

describe('resolveBidiLevels', () => {
  it('assigns level 0 to a pure-LTR string', () => {
    expect(Array.from(resolveBidiLevels('hello', 'auto'))).toEqual([0, 0, 0, 0, 0]);
  });

  it('assigns level 1 to a pure-RTL (Hebrew) string under auto base', () => {
    expect(Array.from(resolveBidiLevels(HEBREW, 'auto'))).toEqual([1, 1, 1, 1]);
  });

  it('embeds an RTL run at an odd level inside an LTR paragraph', () => {
    // "hello שלום world": Latin at level 0, the Hebrew run at level 1, the joining spaces at 0.
    const levels = Array.from(resolveBidiLevels(`hello ${HEBREW} world`, 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('gives European numbers in an RTL context an even (LTR) level above the RTL text', () => {
    // "שלום 123": the Hebrew + space stay at level 1, the digits get level 2 (EN under I2).
    const levels = Array.from(resolveBidiLevels(`${HEBREW} 123`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('raises the paragraph level for an explicit rtl base', () => {
    // Same mixed string, base 'rtl': the Latin words rise to level 2, the Hebrew + spaces sit at 1.
    const levels = Array.from(resolveBidiLevels(`hello ${HEBREW} world`, 'rtl'));
    expect(levels).toEqual([2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it('keeps an explicit ltr base at level 0 for pure-LTR text even with a leading number', () => {
    expect(Array.from(resolveBidiLevels('12ab', 'ltr'))).toEqual([0, 0, 0, 0]);
  });

  it('derives an rtl paragraph from a leading strong-R character under auto', () => {
    // First strong char is Hebrew → paragraph level 1; the trailing Latin rises to level 2.
    const levels = Array.from(resolveBidiLevels(`${HEBREW} ab`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2]);
  });

  it('returns an empty array for empty text', () => {
    expect(resolveBidiLevels('', 'auto')).toEqual(new Uint8Array(0));
  });
});
