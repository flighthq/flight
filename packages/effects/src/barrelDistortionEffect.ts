import type { BarrelDistortionEffect } from '@flighthq/types/contract';

export function createBarrelDistortionEffect(
  options: Readonly<Omit<BarrelDistortionEffect, 'kind'>> = {},
): BarrelDistortionEffect {
  return { kind: 'BarrelDistortionEffect', ...options };
}
