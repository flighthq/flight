import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BevelEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';
import { getDirectionalRenderEffectPadding, registerRenderEffectPaddingResolver } from './renderEffectPadding';

// Bevel composite effect: the directional gradient of the blurred silhouette drives a highlight/shadow edge band, clipped by bevelType, then applies sourceMode compositing.
export function createBevelEffect(
  options: Readonly<Omit<EntityWithoutRuntime<BevelEffect>, 'kind'>> = {},
): BevelEffect {
  const out = allocateEntity<BevelEffect>();
  initializeBevelEffect(out, options);
  return finishEntity(out);
}

export function getBevelEffectPadding(effect: Readonly<BevelEffect>): RenderEffectPadding {
  const angle = ((effect.angle ?? 45) * Math.PI) / 180;
  const distance = effect.distance ?? 4;
  return getDirectionalRenderEffectPadding(
    effect.blurX ?? 4,
    effect.blurY ?? 4,
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
  );
}

export function initializeBevelEffect(
  out: EntityConstruction<BevelEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<BevelEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'BevelEffect');
  out.angle = options.angle;
  out.bevelType = options.bevelType;
  out.blurX = options.blurX;
  out.blurY = options.blurY;
  out.distance = options.distance;
  out.highlightAlpha = options.highlightAlpha;
  out.highlightColor = options.highlightColor;
  out.quality = options.quality;
  out.shadowAlpha = options.shadowAlpha;
  out.shadowColor = options.shadowColor;
  out.sourceMode = options.sourceMode;
  out.strength = options.strength;
}

export function registerBevelEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'BevelEffect', resolveBevelEffectPadding);
}

function resolveBevelEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getBevelEffectPadding(effect as Readonly<BevelEffect>);
}
