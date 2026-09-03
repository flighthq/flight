import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  GlitchEffect,
  RenderEffect,
  RenderEffectPadding,
  RenderState,
} from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createGlitchEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GlitchEffect>, 'kind'>> = {},
): GlitchEffect {
  return createEntity({ kind: 'GlitchEffect', ...options });
}

export function getGlitchEffectPadding(effect: Readonly<GlitchEffect>): RenderEffectPadding {
  const tear = Math.abs(effect.intensity ?? 0.5) * 40;
  const channelShift = Math.abs(effect.colorShift ?? 8) * 1.4;
  const horizontal = Math.ceil(tear + channelShift);
  return { bottom: 0, left: horizontal, right: horizontal, top: 0 };
}

export function registerGlitchEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'GlitchEffect', resolveGlitchEffectPadding);
}

function resolveGlitchEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getGlitchEffectPadding(effect as Readonly<GlitchEffect>);
}
