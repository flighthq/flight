import { createEntity } from '@flighthq/entity/contract';
import type { DropShadowEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Drop-shadow composite effect: tint the scene silhouette, blur it, offset it by angle/distance, then apply sourceMode compositing.
export function createDropShadowEffect(options: Readonly<Omit<DropShadowEffect, 'kind'>> = {}): DropShadowEffect {
  return createEntity({ kind: 'DropShadowEffect', ...options });
}

export function getDropShadowEffectPadding(effect: Readonly<DropShadowEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function registerDropShadowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'DropShadowEffect', resolveDropShadowEffectPadding);
}

function resolveDropShadowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getDropShadowEffectPadding(effect as Readonly<DropShadowEffect>);
}
