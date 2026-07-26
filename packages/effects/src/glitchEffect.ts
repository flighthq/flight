import type { GlitchEffect } from '@flighthq/types/contract';

export function createGlitchEffect(options: Readonly<Omit<GlitchEffect, 'kind'>> = {}): GlitchEffect {
  return { kind: 'GlitchEffect', ...options };
}
