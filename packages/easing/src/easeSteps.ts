// Generated from crates/flight-easing/src/ease_steps.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

export type StepPosition = 'jumpStart' | 'jumpEnd' | 'jumpNone' | 'jumpBoth';

/**
 * Reports a degenerate stepped-easing call before it silently produces NaN.
 */
export type EasingStepsGuard = (count: number, position: StepPosition) => void;

const STEPS_GUARD: { value: EasingStepsGuard | null } = { value: null };

/**
 * Returns a stepped easing function that quantizes [0,1] into `count` equal
 * intervals, jumping at the position(s) selected by `position`. An omitted
 * position jumps at each interval end.
 *
 * Sharp edge: a count of 1 with no jumps at either edge has zero jumps, so the
 * returned function divides by zero and yields NaN for every input.
 */
export function easeSteps(count: number, position?: StepPosition): EasingFunction {
  position = position ?? 'jumpEnd';
  if (position === 'jumpNone' && count < 2) {
    const guard = STEPS_GUARD.value;
    if (guard !== null) {
      const g = guard;
      g(count, position);
    }
  }
  const jumps = (() => {
    const matchValue = position;
    switch (matchValue) {
      case 'jumpNone':
        return count - 1;
      case 'jumpBoth':
        return count + 1;
      default:
        return count;
    }
  })();
  const startOffset = (() => {
    const matchValue = position;
    switch (matchValue) {
      case 'jumpStart':
      case 'jumpBoth':
        return 1;
      default:
        return 0;
    }
  })();
  const countF = count;
  const jumpsF = jumps;
  return (t: number): number => {
    let step = Math.floor(t * countF) | 0;
    step += startOffset;
    if (t >= 0.0 && step < 0) {
      step = 0;
    }
    if (t <= 1.0 && step > jumps) {
      step = jumps;
    }
    return step / jumpsF;
  };
}

export function getStepPositionString(value: StepPosition): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'jumpStart':
        return 'jumpStart';
      case 'jumpEnd':
        return 'jumpEnd';
      case 'jumpNone':
        return 'jumpNone';
      case 'jumpBoth':
        return 'jumpBoth';
    }
  })();
}

export function parseStepPosition(value: string): StepPosition | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'jumpStart':
        return 'jumpStart';
      case 'jumpEnd':
        return 'jumpEnd';
      case 'jumpNone':
        return 'jumpNone';
      case 'jumpBoth':
        return 'jumpBoth';
      default:
        return undefined;
    }
  })();
}

/**
 * Sets or clears the diagnostics callback for degenerate step-easing calls.
 * Providing no guard removes the installed guard.
 */
export function setEasingStepsGuard(guard: EasingStepsGuard | null): void {
  let slot = STEPS_GUARD;
  slot.value = guard;
}
