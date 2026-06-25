import type { BarrelDistortionEffect } from '@flighthq/types';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<BarrelDistortionEffect, 'kind'>> = {},
): BarrelDistortionEffect {
  return { kind: 'BarrelDistortionEffect', ...options };
}
