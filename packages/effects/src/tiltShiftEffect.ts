import type { TiltShiftEffect } from '@flighthq/types/contract';

export function createTiltShiftEffect(options: Readonly<Omit<TiltShiftEffect, 'kind'>> = {}): TiltShiftEffect {
  return { kind: 'TiltShiftEffect', ...options };
}
