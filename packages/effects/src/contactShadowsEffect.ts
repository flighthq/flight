import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ContactShadowsEffect,
  EntityConstruction,
  EntityWithoutRuntime,
  Effect,
  EffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';

export function createContactShadowsEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ContactShadowsEffect>, 'kind'>> = {},
): ContactShadowsEffect {
  const out = allocateEntity<ContactShadowsEffect>();
  initializeContactShadowsEffect(out, options);
  return finishEntity(out);
}

// Contact shadows are a screen-space depth treatment and do not expand a node-local silhouette.
export function getContactShadowsEffectPadding(_effect: Readonly<ContactShadowsEffect>): EffectPadding {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

export function initializeContactShadowsEffect(
  out: EntityConstruction<ContactShadowsEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ContactShadowsEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ContactShadowsEffect');
  out.distance = options.distance;
  out.opacity = options.opacity;
  out.samples = options.samples;
  out.smoothness = options.smoothness;
}

export function registerContactShadowsEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'ContactShadowsEffect', resolveContactShadowsEffectPadding);
}

function resolveContactShadowsEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getContactShadowsEffectPadding(effect as Readonly<ContactShadowsEffect>);
}
