import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  GradientGlowEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Gradient-glow composite effect: an outer glow whose color is looked up from a colors/alphas/ratios gradient ramp indexed by the blurred silhouette alpha, then sourceMode decides source compositing.
export function createGradientGlowEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GradientGlowEffect>, 'kind'>>,
): GradientGlowEffect {
  const out = allocateEntity<GradientGlowEffect>();
  initializeGradientGlowEffect(out, options);
  return finishEntity(out);
}

export function getGradientGlowEffectPadding(effect: Readonly<GradientGlowEffect>): RenderEffectPadding {
  return getGaussianRenderEffectPadding(effect.blurX ?? 6, effect.blurY ?? 6);
}

export function initializeGradientGlowEffect(
  out: EntityConstruction<GradientGlowEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<GradientGlowEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'GradientGlowEffect');
  out.alphas = options.alphas;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.colors = options.colors;
  out.quality = options.quality;
  out.ratios = options.ratios;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerGradientGlowEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'GradientGlowEffect', resolveGradientGlowEffectPadding);
}

function resolveGradientGlowEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getGradientGlowEffectPadding(effect as Readonly<GradientGlowEffect>);
}
