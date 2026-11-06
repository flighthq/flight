import type { ShapeCommandKey } from '@flighthq/shape/contract';
import type { Texture } from '@flighthq/texture/contract';

// Runtime counterpart to ShapeCommandRegistry's compile-time labeled tuples. Argument names are
// authoring-format field names, while types and requiredArgumentCount are the positional validation
// contract shared by every command codec. Keeping all three together prevents a text codec and a
// positional codec from growing independent tables that can drift.
export interface ShapeCommandSchema<K extends ShapeCommandKey = ShapeCommandKey> {
  readonly arguments: readonly ShapeCommandSchemaArgument[];
  readonly key: K;
  readonly requiredArgumentCount: number;
}

export interface ShapeCommandSchemaArgument {
  readonly name: string;
  readonly type: ShapeCommandSchemaArgumentType;
}

export type ShapeCommandSchemaArgumentType =
  | 'boolean'
  | 'matrixOrNull'
  | 'number'
  | 'numbers'
  | 'numbersOrNull'
  | 'string'
  | 'texture';

// The reference persisted for a `beginTextureFill`/`lineTextureStyle` command in place of its live
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
  // Rehydrates a `beginTextureFill`/`lineTextureStyle` Texture from its serialized ordinal reference.
  // When omitted, or when it returns `null`, the texture-bearing command is dropped and the rest of
  // the shape parses intact.
  resolveTexture?: (reference: Readonly<ShapeTextureReference>) => Texture | null;
}
