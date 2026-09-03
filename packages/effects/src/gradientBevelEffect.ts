import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  GradientBevelEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then sourceMode decides source compositing.
export function createGradientBevelEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GradientBevelEffect>, 'kind'>>,
): GradientBevelEffect {
  return createEntity({ kind: 'GradientBevelEffect', ...options });
}

export function getGradientBevelEffectPadding(effect: Readonly<GradientBevelEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function registerGradientBevelEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'GradientBevelEffect', resolveGradientBevelEffectPadding);
}

function resolveGradientBevelEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getGradientBevelEffectPadding(effect as Readonly<GradientBevelEffect>);
}
