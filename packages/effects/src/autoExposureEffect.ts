import type { AutoExposureEffect } from '@flighthq/types/contract';

export function createAutoExposureEffect(options: Readonly<Omit<AutoExposureEffect, 'kind'>> = {}): AutoExposureEffect {
  return { kind: 'AutoExposureEffect', ...options };
}
