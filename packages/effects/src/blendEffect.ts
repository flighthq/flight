import type { AdvancedBlendMode, BlendEffect } from '@flighthq/types';

// Advanced-blend composite effect: blends the incoming pipeline layer over a registered backdrop using
// a destination-reading / non-separable mode (the AdvancedBlendMode vocabulary the fixed-function
// BlendMode enum deliberately excludes). `mode` is required; `backdropKey` names the per-state backdrop
// texture the backend samples (registerGlBlendEffectBackdrop), and `opacity` scales the layer's
// contribution 0..1 (default 1). The backend bounces this through an offscreen and samples layer +
// backdrop — it is an effect you apply explicitly, not a cheap node property.
export function createBlendEffect(
  mode: AdvancedBlendMode,
  options: Readonly<Omit<BlendEffect, 'kind' | 'mode'>> = {},
): BlendEffect {
  return { kind: 'BlendEffect', mode, ...options };
}
