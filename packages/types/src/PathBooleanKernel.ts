import type { Entity } from './Entity.ts';
import type { PathBooleanContour } from './PathBooleanContour.ts';
import type { PathBooleanFillRule } from './PathBooleanFillRule.ts';
import type { PathBooleanOperation } from './PathBooleanOperation.ts';

// The swappable engine behind the boolean path operations. A kernel takes two sets of polygon contours
// (subject and clip), a `PathBooleanOperation`, and a `PathBooleanFillRule`, and returns the combined
// result as a fresh set of contours. The fill rule is the kernel-level superset — the public boolean-op
// surface only ever passes `evenOdd`/`nonZero`, but the offset pass reaches `positive` through this seam
// for its self-overlap cleanup. Kept as plain-data-in, plain-data-out (no path or entity types) so a
// heavier native/wasm kernel can implement the same seam. Result contours use the winding convention
// that outer boundaries and holes are counter-wound relative to each other, so they rebuild into a
// single `nonZero` path directly. Kernels must be re-entrant: a guard or diagnostic callback may
// initiate another boolean operation before the outer call returns, so implementations must not retain
// per-call subject, clip, or result state in module globals.
export interface PathBooleanKernel extends Entity {
  computePathBoolean(
    subject: readonly PathBooleanContour[],
    clip: readonly PathBooleanContour[],
    operation: PathBooleanOperation,
    fillRule: PathBooleanFillRule,
  ): readonly PathBooleanContour[];
}
