import { createEntity } from '@flighthq/entity/contract';
import type { RadialBlurEffect } from '@flighthq/types/contract';

export function createRadialBlurEffect(options: Readonly<Omit<RadialBlurEffect, 'kind'>> = {}): RadialBlurEffect {
  return createEntity({ kind: 'RadialBlurEffect', ...options });
}
