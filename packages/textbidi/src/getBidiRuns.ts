import type { BidiDirection, BidiRun } from '@flighthq/types';

import { resolveBidiLevels } from './resolveBidiLevels';

// Resolves `text` under UAX #9 (see resolveBidiLevels) and groups consecutive code units of equal
// embedding level into directional runs. Each run is a half-open [start, end) range in UTF-16 code
// units with its `level` and derived `direction` (even → 'ltr', odd → 'rtl'); a shaper shapes each run
// in its own direction, and reorderBidiLine places the runs of a line in visual order. Returns an empty
// array for empty text.
export function getBidiRuns(text: string, baseDirection: BidiDirection): readonly BidiRun[] {
  const levels = resolveBidiLevels(text, baseDirection);
  const runs: BidiRun[] = [];
  const length = levels.length;
  let start = 0;
  for (let i = 1; i <= length; i++) {
    if (i === length || levels[i] !== levels[start]) {
      const level = levels[start];
      runs.push({ start, end: i, level, direction: level % 2 === 0 ? 'ltr' : 'rtl' });
      start = i;
    }
  }
  return runs;
}
