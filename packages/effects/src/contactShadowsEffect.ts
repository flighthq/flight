import { createEntity } from '@flighthq/entity/contract';
import type { ContactShadowsEffect, RenderEffect, RenderEffectPadding, RenderState } from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createContactShadowsEffect(
  options: Readonly<Omit<ContactShadowsEffect, 'kind'>> = {},
): ContactShadowsEffect {
  return createEntity({ kind: 'ContactShadowsEffect', ...options });
}

// Contact shadows are a screen-space depth treatment and do not expand a node-local silhouette.
export function getContactShadowsEffectPadding(_effect: Readonly<ContactShadowsEffect>): RenderEffectPadding {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

export function registerContactShadowsEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'ContactShadowsEffect', resolveContactShadowsEffectPadding);
}

function resolveContactShadowsEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getContactShadowsEffectPadding(effect as Readonly<ContactShadowsEffect>);
}
