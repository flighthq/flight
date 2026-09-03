import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  GradientGlowEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode decides source compositing.
export function createGradientGlowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GradientGlowEffect>, 'kind'>>,
): GradientGlowEffect {
  return createEntity({ kind: 'GradientGlowEffect', ...options });
}

export function getGradientGlowEffectPadding(effect: Readonly<GradientGlowEffect>): RenderEffectPadding {
  return getGaussianRenderEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function registerGradientGlowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'GradientGlowEffect', resolveGradientGlowEffectPadding);
}

function resolveGradientGlowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getGradientGlowEffectPadding(effect as Readonly<GradientGlowEffect>);
}
