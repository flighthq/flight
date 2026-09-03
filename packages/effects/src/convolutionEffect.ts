import { createEntity } from '@flighthq/entity/contract';
import type { ConvolutionEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createConvolutionEffect(options: Readonly<Omit<ConvolutionEffect, 'kind'>>): ConvolutionEffect {
  return createEntity({ kind: 'ConvolutionEffect', ...options });
}

export function getConvolutionEffectPadding(effect: Readonly<ConvolutionEffect>): RenderEffectPadding {
  const offsetX = Math.floor(Math.max(0, effect.matrixX) * 0.5);
  const offsetY = Math.floor(Math.max(0, effect.matrixY) * 0.5);
  return {
    bottom: offsetY,
    left: Math.max(0, effect.matrixX - 1 - offsetX),
    right: offsetX,
    top: Math.max(0, effect.matrixY - 1 - offsetY),
  };
}

export function registerConvolutionEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'ConvolutionEffect', resolveConvolutionEffectPadding);
}

function resolveConvolutionEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getConvolutionEffectPadding(effect as Readonly<ConvolutionEffect>);
}
