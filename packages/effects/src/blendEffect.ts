import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AdvancedBlendMode,
  BlendEffect,
  EntityConstruction,
  EntityWithoutRuntime,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

// Advanced-blend composite effect: blends the incoming pipeline layer over a registered backdrop using
// a destination-reading / non-separable mode (the AdvancedBlendMode vocabulary the fixed-function
// BlendMode enum deliberately excludes). `mode` is required; `backdropKey` names the per-state backdrop
// resource the backend samples (`registerGlBlendEffectBackdrop` / `registerWgpuBlendEffectBackdrop`), and
// `opacity` scales the layer's contribution 0..1 (default 1). The backend bounces this through an
// offscreen and samples layer + backdrop — it is an effect you apply explicitly, not a cheap node
// property.
export function createBlendEffect(
  mode: AdvancedBlendMode,
  options: Readonly<Omit<EntityWithoutRuntime<BlendEffect>, 'kind' | 'mode'>> = {},
): BlendEffect {
  const out = allocateEntity<BlendEffect>();
  initializeBlendEffect(out, mode, options);
  return finishEntity(out);
}

export function initializeBlendEffect(
  out: EntityConstruction<BlendEffect>,
  mode: AdvancedBlendMode,
  options: Readonly<Omit<EntityWithoutRuntime<BlendEffect>, 'kind' | 'mode'>>,
): void {
  initializeRenderEffect(out, 'BlendEffect');
  out.mode = mode;
  out.backdropKey = options.backdropKey;
  out.opacity = options.opacity;
}
