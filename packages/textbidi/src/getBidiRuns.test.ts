import { describe, expect, it } from 'vitest';

import { getBidiRuns } from './getBidiRuns';

const HEBREW = 'שלום';

describe('getBidiRuns', () => {
  it('returns a single ltr run for pure-LTR text', () => {
    expect(getBidiRuns('hello', 'auto')).toEqual([{ start: 0, end: 5, level: 0, direction: 'ltr' }]);
  });

  it('splits a mixed string into ltr / rtl / ltr runs with correct ranges', () => {
    // "hello שלום world" — the joining spaces stay at level 0, so they attach to the Latin runs.
    expect(getBidiRuns(`hello ${HEBREW} world`, 'auto')).toEqual([
      { start: 0, end: 6, level: 0, direction: 'ltr' },
      { start: 6, end: 10, level: 1, direction: 'rtl' },
      { start: 10, end: 16, level: 0, direction: 'ltr' },
    ]);
  });

  it('returns no runs for empty text', () => {
    expect(getBidiRuns('', 'auto')).toEqual([]);
  });
});
