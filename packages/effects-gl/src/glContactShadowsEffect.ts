import { createSsaoEffect } from '@flighthq/effects/contract';
import type {
  ContactShadowsEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
} from '@flighthq/types/contract';

import { registerGlRenderEffect } from './glRenderEffectRegistry';
import { applySsaoEffectToGl } from './glSsaoEffect';

// Contact shadows share the local-occlusion realization used by SSAO until the effect pipeline
// exposes a sampleable depth attachment. Keeping the mapping in its own leaf gives the public
// descriptor a real, replaceable runner without pulling an all-effects registrar into the bundle.
export function applyContactShadowsEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ContactShadowsEffect>,
): void {
  applySsaoEffectToGl(
    state,
    source,
    dest,
    createSsaoEffect({
      intensity: effect.opacity ?? 0.6,
      radius: effect.distance ?? 0.5,
      samples: effect.samples ?? 16,
    }),
  );
}

export const defaultGlContactShadowsEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyContactShadowsEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ContactShadowsEffect);
};

export function registerGlContactShadowsEffect(state: GlRenderState): void {
  registerGlRenderEffect(state, 'ContactShadowsEffect', defaultGlContactShadowsEffectRunner);
}
