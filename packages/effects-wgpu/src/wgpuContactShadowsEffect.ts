import { createSsaoEffect } from '@flighthq/effects/contract';
import type {
  ContactShadowsEffect,
  WgpuEffectRunner,
  WgpuRenderState,
  WgpuTextureRenderTarget,
} from '@flighthq/types/contract';

import { registerWgpuEffect } from './wgpuEffectRegistry';
import { applySsaoEffectToWgpu } from './wgpuSsaoEffect';

// Mirrors the GL contact-shadow leaf through the existing local-occlusion realization. The runner
// remains independently replaceable when the WGPU effect context gains a sampleable depth target.
export function applyContactShadowsEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuTextureRenderTarget>,
  dest: Readonly<WgpuTextureRenderTarget>,
  effect: Readonly<ContactShadowsEffect>,
): void {
  applySsaoEffectToWgpu(
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

export const defaultWgpuContactShadowsEffectRunner: WgpuEffectRunner = (ctx, effect) => {
  applyContactShadowsEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ContactShadowsEffect);
};

export function registerWgpuContactShadowsEffect(state: WgpuRenderState): void {
  registerWgpuEffect(state, 'ContactShadowsEffect', defaultWgpuContactShadowsEffectRunner);
}
