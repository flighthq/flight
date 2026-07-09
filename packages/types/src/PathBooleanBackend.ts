import type { PathBooleanOperation } from './PathBooleanOperation';
import type { PathWinding } from './ShapeCommand';

// A single contour ring as a flat, plain-number coordinate list `[x0, y0, x1, y1, ...]`. The ring is
// implicitly closed (the last vertex connects back to the first); a repeated closing vertex is
// tolerated but not required. This is the same flat shape `flattenPath` emits, so contours flow from
// the flattener into the kernel and back out to the path builders with no reshaping.
export type PathBooleanContour = readonly number[];

// The swappable engine behind the boolean path operations. A backend takes two sets of polygon
// contours (subject and clip), a `PathBooleanOperation`, and a `PathWinding` fill rule, and returns the
// combined result as a fresh set of contours. Kept as plain-data-in, plain-data-out (no path or entity
// types) so a heavier native/wasm kernel can implement the same seam. Result contours use the winding
// convention that outer boundaries and holes are counter-wound relative to each other, so they rebuild
// into a single `nonZero` path directly.
export interface PathBooleanBackend {
  computePathBoolean(
    subject: readonly PathBooleanContour[],
    clip: readonly PathBooleanContour[],
    operation: PathBooleanOperation,
    fillRule: PathWinding,
  ): readonly PathBooleanContour[];
}
