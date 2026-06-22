import type { ScreenSpaceFogEffect } from '@flighthq/types';

export function createScreenSpaceFogEffect(
  options: Readonly<Omit<ScreenSpaceFogEffect, 'kind'>> = {},
): ScreenSpaceFogEffect {
  return { kind: 'ScreenSpaceFogEffect', ...options };
}
