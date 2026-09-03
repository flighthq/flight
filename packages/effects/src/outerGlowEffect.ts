import { createEntity } from '@flighthq/entity/contract';
import type { OuterGlowEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Outer-glow composite effect: tint the scene silhouette, blur it centered (no offset), then apply sourceMode compositing.
export function createOuterGlowEffect(options: Readonly<Omit<OuterGlowEffect, 'kind'>> = {}): OuterGlowEffect {
  return createEntity({ kind: 'OuterGlowEffect', ...options });
}

export function getOuterGlowEffectPadding(effect: Readonly<OuterGlowEffect>): RenderEffectPadding {
  return getGaussianRenderEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function registerOuterGlowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'OuterGlowEffect', resolveOuterGlowEffectPadding);
}

function resolveOuterGlowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getOuterGlowEffectPadding(effect as Readonly<OuterGlowEffect>);
}
