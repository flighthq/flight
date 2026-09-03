import { createEntity } from '@flighthq/entity/contract';
import type { InnerShadowEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Inner-shadow composite effect: tint the inverted silhouette, blur, offset by angle/distance, clip to the source alpha, then draw or hide the source.
export function createInnerShadowEffect(options: Readonly<Omit<InnerShadowEffect, 'kind'>> = {}): InnerShadowEffect {
  return createEntity({ kind: 'InnerShadowEffect', ...options });
}

export function getInnerShadowEffectPadding(effect: Readonly<InnerShadowEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function registerInnerShadowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'InnerShadowEffect', resolveInnerShadowEffectPadding);
}

function resolveInnerShadowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getInnerShadowEffectPadding(effect as Readonly<InnerShadowEffect>);
}
