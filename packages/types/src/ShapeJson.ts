import type { ImageResource } from './ImageResource';

// The reference persisted for a `beginBitmapFill`/`lineBitmapStyle` command in place of its live
// `ImageResource`. An `ImageResource` carries no stable serializable id (it is a runtime entity plus
// pixel bytes), so the reference is the zero-based ordinal of the bitmap-bearing command within the
// shape, assigned in command order during `formatShapeJson`. The caller maps this ordinal back to a
// resource via `ShapeJsonParseOptions.resolveBitmap`.
export interface ShapeBitmapReference {
  index: number;
}

export interface ShapeJsonFormatOptions {
  // Passed through to `JSON.stringify` as its `space` argument for pretty-printing. Omit for compact.
  space?: number | string;
}

export interface ShapeJsonParseOptions {
  // Rehydrates a `beginBitmapFill`/`lineBitmapStyle` bitmap from its serialized ordinal reference.
  // When omitted, or when it returns `null`, the bitmap-bearing command is dropped and the rest of
  // the shape parses intact.
  resolveBitmap?: (reference: Readonly<ShapeBitmapReference>) => ImageResource | null;
}
