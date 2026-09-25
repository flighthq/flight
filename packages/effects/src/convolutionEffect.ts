import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ConvolutionEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';

export function createConvolutionEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ConvolutionEffect>, 'kind'>>,
): ConvolutionEffect {
  const out = allocateEntity<ConvolutionEffect>();
  initializeConvolutionEffect(out, options);
  return finishEntity(out);
}

export function getConvolutionEffectPadding(effect: Readonly<ConvolutionEffect>): EffectPadding {
  const offsetX = Math.floor(Math.max(0, effect.matrixX) * 0.5);
  const offsetY = Math.floor(Math.max(0, effect.matrixY) * 0.5);
  return {
    bottom: offsetY,
    left: Math.max(0, effect.matrixX - 1 - offsetX),
    right: offsetX,
    top: Math.max(0, effect.matrixY - 1 - offsetY),
  };
}

export function initializeConvolutionEffect(
  out: EntityConstruction<ConvolutionEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ConvolutionEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ConvolutionEffect');
  out.matrix = options.matrix;
  out.matrixX = options.matrixX;
  out.matrixY = options.matrixY;
  out.bias = options.bias;
  out.clamp = options.clamp;
  out.color = options.color;
  out.divisor = options.divisor;
  out.preserveAlpha = options.preserveAlpha;
}

export function registerConvolutionEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'ConvolutionEffect', resolveConvolutionEffectPadding);
}

function resolveConvolutionEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getConvolutionEffectPadding(effect as Readonly<ConvolutionEffect>);
}
