import type { PathWinding } from './ShapeCommand';

// The fill rule the boolean kernel resolves a region under — a path-boolean-local superset of the core
// `PathWinding`. `evenOdd` (parity) and `nonZero` (winding-number) are the two rules a public path or SVG
// carries and the only two the boolean-op surface (`unionPaths`, `simplifyPath`, …) exposes. `positive`
// (winding > 0) and `negative` (winding < 0) are additional kernel-internal rules the offset pass relies
// on: `positive` is the cleanup fill that dissolves the self-overlap a polygon offset produces at concave
// corners and drops over-deflated (orientation-inverted) rings, which neither `evenOdd` nor `nonZero` can.
// They are deliberately kept out of the core `PathWinding` (shapes/SVG stay lean on evenOdd/nonZero) and
// reachable only through the `PathBooleanBackend` seam, not the common boolean-op options.
export type PathBooleanFillRule = PathWinding | 'negative' | 'positive';
