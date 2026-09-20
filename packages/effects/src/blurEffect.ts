import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BlurEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { getGaussianEffectPadding, registerEffectPaddingResolver } from './effectPadding';

// Plain separable Gaussian blur intent. `blurX`/`blurY` are the per-axis Gaussian standard deviations
// in pixels; the backends realize them as a two-pass separable blur bouncing through an offscreen
// target. The spatial-effect sibling of the directional/radial/motion blur variants.
export function createBlurEffect(options: Readonly<Omit<EntityWithoutRuntime<BlurEffect>, 'kind'>> = {}): BlurEffect {
  const out = allocateEntity<BlurEffect>();
  initializeBlurEffect(out, options);
  return finishEntity(out);
}

export function getBlurEffectPadding(effect: Readonly<BlurEffect>): EffectPadding {
  return getGaussianEffectPadding(effect.blurX ?? 4, effect.blurY ?? 4);
}

export function initializeBlurEffect(
  out: EntityConstruction<BlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BlurEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'BlurEffect');
  out.blurX = options.blurX;
  out.blurY = options.blurY;
}

export function registerBlurEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'BlurEffect', resolveBlurEffectPadding);
}

function resolveBlurEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getBlurEffectPadding(effect as Readonly<BlurEffect>);
}
