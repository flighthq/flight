import type { BidiClassKernel, BidiDirection, BidiRun } from '@flighthq/types/contract';

import { resolveBidiLevels } from './resolveBidiLevels';

export function getBidiRuns(
  bidiClassKernel: Readonly<BidiClassKernel>,
  text: string,
  baseDirection: BidiDirection,
): readonly BidiRun[] {
  const levels = resolveBidiLevels(bidiClassKernel, text, baseDirection);
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
