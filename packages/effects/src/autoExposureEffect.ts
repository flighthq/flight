import type { AutoExposureEffect } from '@flighthq/types';

export function createAutoExposureEffect(options: Readonly<Omit<AutoExposureEffect, 'kind'>> = {}): AutoExposureEffect {
  return { kind: 'AutoExposureEffect', ...options };
}
