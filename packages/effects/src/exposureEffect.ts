import type { ExposureEffect } from '@flighthq/types';

export function createExposureEffect(options: Readonly<Omit<ExposureEffect, 'kind'>> = {}): ExposureEffect {
  return { kind: 'ExposureEffect', ...options };
}
