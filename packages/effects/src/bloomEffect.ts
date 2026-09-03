import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  BloomEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { getGaussianRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// HDR bloom intent and its shared recipe math. The parameter math is substrate-agnostic so the Gl and
// Wgpu bloom recipes derive identical bright-pass cutoff, additive strength, and blur radius from the
// same intent.

export function computeBloomBlurRadius(effect: Readonly<BloomEffect>): number {
  return Math.max(0, effect.radius ?? 8);
}

export function computeBloomIntensity(effect: Readonly<BloomEffect>): number {
  return effect.intensity ?? 1;
}

export function computeBloomThreshold(effect: Readonly<BloomEffect>): number {
  return effect.threshold ?? 0.8;
}

export function createBloomEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BloomEffect>, 'kind'>> = {},
): BloomEffect {
  return createEntity({ kind: 'BloomEffect', ...options });
}

export function getBloomEffectPadding(effect: Readonly<BloomEffect>): RenderEffectPadding {
  const radius = computeBloomBlurRadius(effect);
  return getGaussianRenderEffectPadding(radius, radius);
}

export function registerBloomEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BloomEffect', resolveBloomEffectPadding);
}

function resolveBloomEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBloomEffectPadding(effect as Readonly<BloomEffect>);
}
