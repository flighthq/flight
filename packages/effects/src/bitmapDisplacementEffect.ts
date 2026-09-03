import { createEntity } from '@flighthq/entity/contract';
import type {
  BitmapDisplacementEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
  Texture2D,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createBitmapDisplacementEffect(
  map: Readonly<Texture2D> | null,
  options: Readonly<Omit<BitmapDisplacementEffect, 'kind' | 'map'>> = {},
): BitmapDisplacementEffect {
  return createEntity({ kind: 'BitmapDisplacementEffect', map, ...options });
}

export function getBitmapDisplacementEffectPadding(effect: Readonly<BitmapDisplacementEffect>): RenderEffectPadding {
  const horizontal = Math.ceil(Math.abs(effect.scaleX ?? 0) * 0.5);
  const vertical = Math.ceil(Math.abs(effect.scaleY ?? 0) * 0.5);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function registerBitmapDisplacementEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BitmapDisplacementEffect', resolveBitmapDisplacementEffectPadding);
}

function resolveBitmapDisplacementEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBitmapDisplacementEffectPadding(effect as Readonly<BitmapDisplacementEffect>);
}
