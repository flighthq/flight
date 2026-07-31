import type { StepPosition } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { easeSteps, setEasingStepsGuard } from './easeSteps';

describe('setEasingStepsGuard', () => {
  it('reports the degenerate jumpNone call that silently returns NaN', () => {
    const seen: [number, StepPosition][] = [];
    setEasingStepsGuard((count, position) => seen.push([count, position]));
    try {
      // The failure being reported: one step with no edge jump leaves zero jumps to divide by.
      expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
    } finally {
      setEasingStepsGuard(null);
    }
    expect(seen).toEqual([[1, 'jumpNone']]);
  });

  it('stays silent for well-defined calls, and when no guard is installed', () => {
    const seen: number[] = [];
    setEasingStepsGuard((count) => seen.push(count));
    try {
      easeSteps(2, 'jumpNone')(0.5); // count >= 2 is the documented minimum for jumpNone
      easeSteps(1, 'jumpEnd')(0.5); // every edge-jumping position is defined for count >= 1
      easeSteps(1, 'jumpStart')(0.5);
      easeSteps(1, 'jumpBoth')(0.5);
    } finally {
      setEasingStepsGuard(null);
    }
    expect(seen).toEqual([]);
    // Production default: still NaN, but nothing is reported.
    expect(Number.isNaN(easeSteps(1, 'jumpNone')(0.5))).toBe(true);
  });
});
