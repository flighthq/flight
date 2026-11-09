import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';
import type { RenderState } from '@flighthq/render/contract';
import type { EffectPadding } from '@flighthq/render/contract';

import { initializeEffect } from './effect.ts';
import { registerEffectPaddingResolver } from './effectPadding.ts';
import type { Effect } from './types.ts';
import type { GlitchEffect } from './types/GlitchEffect.ts';

export function createGlitchEffect(
  options: Readonly<Omit<EntityWithoutRuntime<GlitchEffect>, 'kind'>> = {},
): GlitchEffect {
  const out = allocateEntity<GlitchEffect>();
  initializeGlitchEffect(out, options);
  return out;
}

export function getGlitchEffectPadding(effect: Readonly<GlitchEffect>): EffectPadding {
  const tear = Math.abs(effect.intensity ?? 0.5) * 40;
  const channelShift = Math.abs(effect.colorShift ?? 8) * 1.4;
  const horizontal = Math.ceil(tear + channelShift);
  return { bottom: 0, left: horizontal, right: horizontal, top: 0 };
}

export function initializeGlitchEffect(
  out: EntityConstruction<GlitchEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<GlitchEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'GlitchEffect');
  out.intensity = options.intensity;
  out.blockSize = options.blockSize;
  out.colorShift = options.colorShift;
  out.seed = options.seed;
}

export function registerGlitchEffectPaddingResolver(state: RenderState): void {
  registerEffectPaddingResolver(state, 'GlitchEffect', resolveGlitchEffectPadding);
}

function resolveGlitchEffectPadding(effect: Readonly<Effect>): EffectPadding {
  return getGlitchEffectPadding(effect as Readonly<GlitchEffect>);
}
