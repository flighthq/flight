import type { PathWinding } from './ShapeCommand';

// Options for a boolean operation between two paths. `fillRule` decides how each operand's own
// contours resolve to a filled region before combining (`nonZero` = winding-number fill, the default;
// `evenOdd` = parity fill — the two differ on self-overlapping input such as a figure-eight).
// `tolerance` is the curve-flattening deviation in path units passed to `flattenPath`; it defaults to
// the same 0.25 the flattener uses, so callers rarely set it.
export interface PathBooleanOptions {
  fillRule?: PathWinding;
  tolerance?: number;
}
