import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, RadialBlurEffect } from '@flighthq/types/contract';

export function createRadialBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<RadialBlurEffect>, 'kind'>> = {},
): RadialBlurEffect {
  return createEntity({ kind: 'RadialBlurEffect', ...options });
}
