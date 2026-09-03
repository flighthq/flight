import { createEntity } from '@flighthq/entity/contract';
import type { InnerGlowEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Inner-glow composite effect: tint the inverted silhouette, blur inward, clip to the source alpha, then draw or hide the source.
export function createInnerGlowEffect(options: Readonly<Omit<InnerGlowEffect, 'kind'>> = {}): InnerGlowEffect {
  return createEntity({ kind: 'InnerGlowEffect', ...options });
}

export function getInnerGlowEffectPadding(effect: Readonly<InnerGlowEffect>): RenderEffectPadding {
  return getGaussianRenderEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function registerInnerGlowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'InnerGlowEffect', resolveInnerGlowEffectPadding);
}

function resolveInnerGlowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getInnerGlowEffectPadding(effect as Readonly<InnerGlowEffect>);
}
