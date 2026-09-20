import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  DirectionalBlurEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect';
import { registerEffectPaddingResolver } from './effectPadding';

export function createDirectionalBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<DirectionalBlurEffect>, 'kind'>> = {},
): DirectionalBlurEffect {
  const out = allocateEntity<DirectionalBlurEffect>();
  initializeDirectionalBlurEffect(out, options);
  return finishEntity(out);
}

export function getDirectionalBlurEffectPadding(effect: Readonly<DirectionalBlurEffect>): EffectPadding {
  // `angle` is DEGREES on the descriptor (authoring layer); trig is radians, so convert here. This is
  // the same seam every other angle-carrying effect converts at, and it is a consumer rather than a
  // runner — a unit change that missed this one would leave the padding right for one angle only.
  const angle = ((effect.angle ?? 0) * Math.PI) / 180;
  const halfLength = Math.max(0, effect.length ?? 8) * 0.5;
  const projectedX = Math.abs(Math.cos(angle) * halfLength);
  const projectedY = Math.abs(Math.sin(angle) * halfLength);
  const horizontal = projectedX < 1e-10 ? 0 : Math.ceil(projectedX);
  const vertical = projectedY < 1e-10 ? 0 : Math.ceil(projectedY);
  return { bottom: vertical, left: horizontal, right: horizontal, top: vertical };
}

export function initializeDirectionalBlurEffect(
  out: EntityConstruction<DirectionalBlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<DirectionalBlurEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'DirectionalBlurEffect');
  out.angle = options.angle;
  out.length = options.length;
  out.samples = options.samples;
}

export function registerDirectionalBlurEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'DirectionalBlurEffect', resolveDirectionalBlurEffectPadding);
}

function resolveDirectionalBlurEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getDirectionalBlurEffectPadding(effect as Readonly<DirectionalBlurEffect>);
}
