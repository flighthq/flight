import { createEntity } from '@flighthq/entity/contract';
import type { AutoExposureEffect } from '@flighthq/types/contract';

export function createAutoExposureEffect(options: Readonly<Omit<AutoExposureEffect, 'kind'>> = {}): AutoExposureEffect {
  return createEntity({ kind: 'AutoExposureEffect', ...options });
}
