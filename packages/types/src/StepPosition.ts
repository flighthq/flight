// Jump position for a CSS-style stepped easing. Names the placement of the
// stairstep's first and last jumps relative to the [0,1] interval, matching the
// CSS `steps()` `<step-position>` keywords (jump-start/end/none/both).
export type StepPosition = 'jumpBoth' | 'jumpEnd' | 'jumpNone' | 'jumpStart';

// Reports a degenerate `easeSteps` call — a `count` below the minimum the `position` allows, which would
// otherwise yield NaN silently. Installed by `enableEasingGuards` in @flighthq/easing through that
// package's `setEasingStepsGuard` seam; a null slot is the production default and costs one comparison.
export type EasingStepsGuard = (count: number, position: StepPosition) => void;
