import type { ColorBlindSimulationEffect } from '@flighthq/types';

export function createColorBlindSimulationEffect(
  options: Readonly<Omit<ColorBlindSimulationEffect, 'kind'>> = {},
): ColorBlindSimulationEffect {
  return { kind: 'ColorBlindSimulationEffect', ...options };
}
