import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, PixelateEffect } from '@flighthq/types/contract';

export function createPixelateEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PixelateEffect>, 'kind'>> = {},
): PixelateEffect {
  return createEntity({ kind: 'PixelateEffect', ...options });
}
