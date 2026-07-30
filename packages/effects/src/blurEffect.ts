import type { BlurEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Plain separable Gaussian blur intent. `blurX`/`blurY` are the per-axis Gaussian standard deviations
// in pixels; the backends realize them as a two-pass separable blur bouncing through an offscreen
// target. The spatial-effect sibling of the directional/radial/motion blur variants.
export function createBlurEffect(options: Readonly<Omit<BlurEffect, 'kind'>> = {}): BlurEffect {
  return { kind: 'BlurEffect', ...options };
}

export function getBlurEffectPadding(effect: Readonly<BlurEffect>): RenderEffectPadding {
  const horizontal = Math.ceil(Math.max(0, effect.blurX ?? 4) * 3);
  const vertical = Math.ceil(Math.max(0, effect.blurY ?? 4) * 3);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerBlurEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BlurEffect', resolveBlurEffectPadding);
}

function resolveBlurEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBlurEffectPadding(effect as Readonly<BlurEffect>);
}
