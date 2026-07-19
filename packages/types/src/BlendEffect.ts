import type { AdvancedBlendMode } from './AdvancedBlendMode';
import type { RenderEffect } from './RenderEffect';

// Advanced blend as an explicit composite effect: blend the incoming pipeline layer (the effect's
// `source`, treated as the foreground) over a backdrop using a destination-reading / non-separable mode
// the fixed-function `BlendMode` enum cannot express. The backdrop is a per-state registered texture
// referenced by `backdropKey` (populated with registerGlBlendEffectBackdrop), mirroring how
// CustomShaderEffect references a registered fragment source — a live WebGLTexture cannot live in plain
// serializable data, so the intent carries the key and the backend resolves it. An unregistered key
// composites the layer over an implicit transparent backdrop (source-over passthrough) rather than
// erroring. `opacity` scales the layer's contribution 0..1 (W3C `mix` term), default 1.
export interface BlendEffect extends RenderEffect {
  kind: 'BlendEffect';
  mode: AdvancedBlendMode;
  backdropKey?: string;
  opacity?: number;
}
