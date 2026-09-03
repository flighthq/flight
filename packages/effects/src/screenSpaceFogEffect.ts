import { createEntity } from '@flighthq/entity/contract';
import type { ScreenSpaceFogEffect } from '@flighthq/types/contract';

export function createScreenSpaceFogEffect(
  options: Readonly<Omit<ScreenSpaceFogEffect, 'kind'>> = {},
): ScreenSpaceFogEffect {
  return createEntity({ kind: 'ScreenSpaceFogEffect', ...options });
}
