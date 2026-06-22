import type { LiftGammaGainEffect } from '@flighthq/types';

export function createLiftGammaGainEffect(
  options: Readonly<Omit<LiftGammaGainEffect, 'kind'>> = {},
): LiftGammaGainEffect {
  return { kind: 'LiftGammaGainEffect', ...options };
}
