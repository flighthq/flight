import type { DirectionalBlurEffect } from '@flighthq/types';

export function createDirectionalBlurEffect(
  options: Readonly<Omit<DirectionalBlurEffect, 'kind'>> = {},
): DirectionalBlurEffect {
  return { kind: 'DirectionalBlurEffect', ...options };
}
