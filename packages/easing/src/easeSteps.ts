import type { EasingFunction, EasingStepsGuard, StepPosition } from '@flighthq/types/contract';

// Returns a stepped easing function that quantizes [0,1] into `count` equal
// intervals, jumping at the position(s) selected by `position`:
//   jumpStart - jump at t=0; the first interval already outputs 1/count.
//   jumpEnd   - jump at t=1 (default); output stays 0 over the first interval.
//   jumpNone  - no jump at either edge; output spans 0..1 with count-1 interior jumps.
//   jumpBoth  - jump at both edges; count+1 levels from 0 to 1 inclusive.
// Follows the CSS Easing Level 1 step algorithm.
//
// Sharp edge: easeSteps(1, 'jumpNone') has jumps = count - 1 = 0, so the returned function divides by
// zero and yields NaN for every input. This mirrors the CSS spec, which forbids steps(1, jump-none) for
// the same reason; `count >= 2` is required with 'jumpNone', while every other position is well-defined
// for count >= 1. The failure is SILENT — NaN propagates into whatever the easing drives — so the
// degenerate call routes through the guard seam below, which enableEasingGuards turns into a warning.
export function easeSteps(count: number, position: StepPosition = 'jumpEnd'): EasingFunction {
  if (position === 'jumpNone' && count < 2) _stepsGuard?.(count, position);
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

// The diagnostics seam for the degenerate `easeSteps` call, not the caller-facing entry point — use
// `enableEasingGuards`, which installs the @flighthq/log reporter through here. Null uninstalls it, and a
// null slot is what production sees: the check above is one comparison and the message text plus the
// @flighthq/log dependency live only in the separately-imported guard module.
export function setEasingStepsGuard(guard: EasingStepsGuard | null): void {
  _stepsGuard = guard;
}

let _stepsGuard: EasingStepsGuard | null = null;
