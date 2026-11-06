import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';
import type { Texture2D } from '@flighthq/texture/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { BitmapDisplacementEffect } from './types/BitmapDisplacementEffect.ts';

export function createBitmapDisplacementEffect(
  map: Readonly<Texture2D> | null,
  options: Readonly<Omit<EntityWithoutRuntime<BitmapDisplacementEffect>, 'kind' | 'map'>> = {},
): BitmapDisplacementEffect {
  const out = allocateEntity<BitmapDisplacementEffect>();
  initializeBitmapDisplacementEffect(out, map, options);
  return finishEntity(out);
}

export function getBitmapDisplacementEffectPadding(effect: Readonly<BitmapDisplacementEffect>): EffectPadding {
  const horizontal = Math.ceil(Math.abs(effect.scaleX ?? 0) * 0.5);
  const vertical = Math.ceil(Math.abs(effect.scaleY ?? 0) * 0.5);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function initializeBitmapDisplacementEffect(
  out: EntityConstruction<BitmapDisplacementEffect>,
  map: Readonly<Texture2D> | null,
  options: Readonly<Omit<EntityWithoutRuntime<BitmapDisplacementEffect>, 'kind' | 'map'>>,
): void {
  initializeEffect(out, 'BitmapDisplacementEffect');
  out.map = map;
  out.componentX = options.componentX;
  out.componentY = options.componentY;
  out.scaleX = options.scaleX;
  out.scaleY = options.scaleY;
  out.edgeMode = options.edgeMode;
}

export function registerBitmapDisplacementEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'BitmapDisplacementEffect', resolveBitmapDisplacementEffectPadding);
}

function resolveBitmapDisplacementEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getBitmapDisplacementEffectPadding(effect as Readonly<BitmapDisplacementEffect>);
}
