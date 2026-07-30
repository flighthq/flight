import type { Kind } from './Entity';
import type { Signal } from './Signal';

// Stable numeric registry identifiers keep diagnostic policy and human-readable messages out of
// render core. Guard modules translate these values only after the opt-in signal seam is enabled.
export enum RenderRegistry {
  EffectPaddingResolver,
  NodeRenderer,
  ShapeCommandHandler,
  TextureResolver,
}

export interface RenderRegistrySignals {
  onRegistryMiss: Signal<(registry: RenderRegistry, kind: Kind) => void>;
}
