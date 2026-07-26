import type { DirectionalBlurEffect } from '@flighthq/types/contract';

export function createDirectionalBlurEffect(
  options: Readonly<Omit<DirectionalBlurEffect, 'kind'>> = {},
): DirectionalBlurEffect {
  return { kind: 'DirectionalBlurEffect', ...options };
}
