import type { BrightnessContrastEffect } from '@flighthq/types';

export function createBrightnessContrastEffect(
  options: Readonly<Omit<BrightnessContrastEffect, 'kind'>> = {},
): BrightnessContrastEffect {
  return { kind: 'BrightnessContrastEffect', ...options };
}
