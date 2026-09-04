import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BitmapDisplacementEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
  Texture2D,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createBitmapDisplacementEffect(
  map: Readonly<Texture2D> | null,
  options: Readonly<Omit<EntityWithoutRuntime<BitmapDisplacementEffect>, 'kind' | 'map'>> = {},
): BitmapDisplacementEffect {
  const out = allocateEntity<BitmapDisplacementEffect>();
  initializeBitmapDisplacementEffect(out, map, options);
  return finishEntity(out);
}

export function getBitmapDisplacementEffectPadding(effect: Readonly<BitmapDisplacementEffect>): RenderEffectPadding {
  const horizontal = Math.ceil(Math.abs(effect.scaleX ?? 0) * 0.5);
  const vertical = Math.ceil(Math.abs(effect.scaleY ?? 0) * 0.5);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function initializeBitmapDisplacementEffect(
  out: EntityConstruction<BitmapDisplacementEffect>,
  map: Readonly<Texture2D> | null,
  options: Readonly<Omit<EntityWithoutRuntime<BitmapDisplacementEffect>, 'kind' | 'map'>>,
): void {
  initializeRenderEffect(out, 'BitmapDisplacementEffect');
  out.map = map;
  out.componentX = options.componentX;
  out.componentY = options.componentY;
  out.scaleX = options.scaleX;
  out.scaleY = options.scaleY;
  out.edgeMode = options.edgeMode;
}

export function registerBitmapDisplacementEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BitmapDisplacementEffect', resolveBitmapDisplacementEffectPadding);
}

function resolveBitmapDisplacementEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBitmapDisplacementEffectPadding(effect as Readonly<BitmapDisplacementEffect>);
}
