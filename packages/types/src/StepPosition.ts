// Jump position for a CSS-style stepped easing. Names the placement of the
// stairstep's first and last jumps relative to the [0,1] interval, matching the
// CSS `steps()` `<step-position>` keywords (jump-start/end/none/both).
export type StepPosition = 'jumpBoth' | 'jumpEnd' | 'jumpNone' | 'jumpStart';
