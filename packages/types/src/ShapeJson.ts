import type { Texture } from './Texture';

// The reference persisted for a `beginBitmapFill`/`lineBitmapStyle` command in place of its live
// `Texture`. A Texture carries no stable serializable id (it is a runtime entity over backing storage
// and sampling intent), so the reference is the zero-based ordinal of the texture-bearing command within the
// shape, assigned in command order during `formatShapeJson`. The caller maps this ordinal back to a
// texture via `ShapeJsonParseOptions.resolveTexture`.
export interface ShapeTextureReference {
  index: number;
}

export interface ShapeJsonFormatOptions {
  // Passed through to `JSON.stringify` as its `space` argument for pretty-printing. Omit for compact.
  space?: number | string;
}

export interface ShapeJsonParseOptions {
  // Rehydrates a `beginBitmapFill`/`lineBitmapStyle` Texture from its serialized ordinal reference.
  // When omitted, or when it returns `null`, the texture-bearing command is dropped and the rest of
  // the shape parses intact.
  resolveTexture?: (reference: Readonly<ShapeTextureReference>) => Texture | null;
}
