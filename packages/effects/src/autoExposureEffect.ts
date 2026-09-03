import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, AutoExposureEffect } from '@flighthq/types/contract';

export function createAutoExposureEffect(
  options: Readonly<Omit<EntityWithoutRuntime<AutoExposureEffect>, 'kind'>> = {},
): AutoExposureEffect {
  return createEntity({ kind: 'AutoExposureEffect', ...options });
}
