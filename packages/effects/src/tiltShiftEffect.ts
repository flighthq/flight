import type { TiltShiftEffect } from '@flighthq/types';

export function createTiltShiftEffect(options: Readonly<Omit<TiltShiftEffect, 'kind'>> = {}): TiltShiftEffect {
  return { kind: 'TiltShiftEffect', ...options };
}
