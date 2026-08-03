import type { Kind } from './Entity';
import type { Signal } from './Signal';

// Numeric registry identifiers keep diagnostic policy and human-readable messages out of render core.
// Guard modules translate these values only after the opt-in signal seam is enabled. The values are
// assigned by declaration order and nothing persists them, so members stay alphabetized and emitters
// name the member rather than its number — a literal at a callsite would silently mean a different
// registry the moment one is inserted above it.
export enum RenderRegistry {
  BlendRealization,
  EffectPaddingResolver,
  MaterialRenderer,
  MaterialTextureLister,
  ModifierSnippet,
  NodeRenderer,
  ShapeCommandHandler,
  ShapeRasterizer,
  TextureResolver,
}

export interface RenderRegistryMiss {
  readonly kind: Kind;
  readonly registry: RenderRegistry;
}

export interface RenderRegistryMissExplanation {
  readonly misses: readonly Readonly<RenderRegistryMiss>[];
  readonly status: 'complete' | 'misses-recorded';
}

export interface RenderRegistrySignals {
  onRegistryMiss: Signal<(registry: RenderRegistry, kind: Kind) => void>;
}
