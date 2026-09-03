import { createEntity } from '@flighthq/entity/contract';
import type { RenderEffect, RenderEffectPadding, RenderState, TiltShiftEffect } from '@flighthq/types/contract';

import { registerRenderEffectPaddingResolver } from './renderEffectPadding';

export function createTiltShiftEffect(options: Readonly<Omit<TiltShiftEffect, 'kind'>> = {}): TiltShiftEffect {
  return createEntity({ kind: 'TiltShiftEffect', ...options });
}

export function getTiltShiftEffectPadding(effect: Readonly<TiltShiftEffect>): RenderEffectPadding {
  const vertical = Math.ceil(Math.max(0, effect.blur ?? 4) * 3);
  return { bottom: vertical, left: 0, right: 0, top: vertical };
}

export function registerTiltShiftEffectPaddingResolver(state: RenderState): void {
  registerRenderEffectPaddingResolver(state, 'TiltShiftEffect', resolveTiltShiftEffectPadding);
}

function resolveTiltShiftEffectPadding(effect: Readonly<RenderEffect>): RenderEffectPadding {
  return getTiltShiftEffectPadding(effect as Readonly<TiltShiftEffect>);
}
