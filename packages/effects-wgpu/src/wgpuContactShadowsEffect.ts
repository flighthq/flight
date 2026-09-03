import { createSsaoEffect } from '@flighthq/effects/contract';
import type {
  ContactShadowsEffect,
  WgpuRenderEffectRunner,
  WgpuRenderState,
  WgpuRenderTarget,
} from '@flighthq/types/contract';

import { registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';
import { applySsaoEffectToWgpu } from './wgpuSsaoEffect';

// Mirrors the GL contact-shadow leaf through the existing local-occlusion realization. The runner
// remains independently replaceable when the WGPU effect context gains a sampleable depth target.
export function applyContactShadowsEffectToWgpu(
  state: WgpuRenderState,
  source: Readonly<WgpuRenderTarget>,
  dest: Readonly<WgpuRenderTarget>,
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

export const defaultWgpuContactShadowsEffectRunner: WgpuRenderEffectRunner = (ctx, effect) => {
  applyContactShadowsEffectToWgpu(ctx.state, ctx.source, ctx.dest, effect as ContactShadowsEffect);
};

export function registerWgpuContactShadowsEffect(state: WgpuRenderState): void {
  registerWgpuRenderEffect(state, 'ContactShadowsEffect', defaultWgpuContactShadowsEffectRunner);
}
