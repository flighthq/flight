import type { DirectionalBlurEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createDirectionalBlurEffect(
  options: Readonly<Omit<DirectionalBlurEffect, 'kind'>> = {},
): DirectionalBlurEffect {
  return { kind: 'DirectionalBlurEffect', ...options };
}

export function getDirectionalBlurEffectPadding(effect: Readonly<DirectionalBlurEffect>): RenderEffectPadding {
  const angle = effect.angle ?? 0;
  const halfLength = Math.max(0, effect.length ?? 8) * 0.5;
  const projectedX = Math.abs(Math.cos(angle) * halfLength);
  const projectedY = Math.abs(Math.sin(angle) * halfLength);
  const horizontal = projectedX < 1e-10 ? 0 : Math.ceil(projectedX);
  const vertical = projectedY < 1e-10 ? 0 : Math.ceil(projectedY);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerDirectionalBlurEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'DirectionalBlurEffect', resolveDirectionalBlurEffectPadding);
}

function resolveDirectionalBlurEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getDirectionalBlurEffectPadding(effect as Readonly<DirectionalBlurEffect>);
}
