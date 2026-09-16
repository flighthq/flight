// A single contour ring as a flat, plain-number coordinate list `[x0, y0, x1, y1, ...]`. The ring is
// implicitly closed (the last vertex connects back to the first); a repeated closing vertex is
// tolerated but not required. This is the same flat shape `flattenPath` emits, so contours flow from
// the flattener into the kernel and back out to the path builders with no reshaping.
export type PathBooleanContour = readonly number[];
