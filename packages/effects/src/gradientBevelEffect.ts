import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  EntityWithoutRuntime,
  GradientBevelEffect,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { getDirectionalEffectPadding, registerEffectPaddingResolver } from './effectPadding';

// Gradient-bevel composite effect: a bevel whose highlight→shadow band color is looked up from a colors/alphas/ratios gradient ramp indexed by the encoded bevel depth, then sourceMode decides source compositing.
export function createGradientBevelEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GradientBevelEffect>, 'kind'>>,
): GradientBevelEffect {
  const out = allocateEntity<GradientBevelEffect>();
  initializeGradientBevelEffect(out, options);
  return finishEntity(out);
}

export function getGradientBevelEffectPadding(effect: Readonly<GradientBevelEffect>): EffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function initializeGradientBevelEffect(
  out: EntityConstruction<GradientBevelEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<GradientBevelEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'GradientBevelEffect');
  out.alphas = options.alphas;
  out.angle = options.angle;
  out.bevelType = options.bevelType;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.colors = options.colors;
  out.distance = options.distance;
  out.quality = options.quality;
  out.ratios = options.ratios;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerGradientBevelEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'GradientBevelEffect', resolveGradientBevelEffectPadding);
}

function resolveGradientBevelEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getGradientBevelEffectPadding(effect as Readonly<GradientBevelEffect>);
}
