import { createEntity } from '@flighthq/entity/contract';
import type { BarrelDistortionEffect } from '@flighthq/types/contract';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<BarrelDistortionEffect, 'kind'>> = {},
): BarrelDistortionEffect {
  return createEntity({ kind: 'BarrelDistortionEffect', ...options });
}
