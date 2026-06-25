import type { EasingFunction, StepPosition } from '@flighthq/types';

// Returns a stepped easing function with `count` equal steps over [0,1],
// matching CSS `steps(count, <step-position>)` semantics. The position selects
// where the jumps fall relative to the interval:
//   jumpStart - a jump at the start; the first interval already outputs 1/count.
//   jumpEnd   - a jump at the end (default); output holds at 0 over the first interval.
//   jumpNone  - no jump at either edge; output spans the closed range 0..1 with count-1 jumps.
//   jumpBoth  - a jump at both edges; interior intervals span 1/(count+1)..count/(count+1).
// Implements the canonical CSS Easing Level 1 step algorithm.
//
// Sharp edge: easeSteps(1, 'jumpNone') has jumps = count - 1 = 0, so the returned
// function divides by zero and yields NaN. This mirrors the CSS spec, which forbids
// steps(1, jump-none) for the same reason. Callers must pass count >= 2 with
// 'jumpNone'; every other position is well-defined for count >= 1.
export function easeSteps(count: number, position: StepPosition = 'jumpEnd'): EasingFunction {
  const jumps = position === 'jumpNone' ? count - 1 : position === 'jumpBoth' ? count + 1 : count;
  const startOffset = position === 'jumpStart' || position === 'jumpBoth' ? 1 : 0;

  return (t) => {
    let step = Math.floor(t * count) + startOffset;
    if (t >= 0 && step < 0) {
      step = 0;
    }
    if (t <= 1 && step > jumps) {
      step = jumps;
    }
    return step / jumps;
  };
}
