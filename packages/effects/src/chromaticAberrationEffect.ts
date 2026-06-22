import type { ChromaticAberrationEffect } from '@flighthq/types';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<ChromaticAberrationEffect, 'kind'>> = {},
): ChromaticAberrationEffect {
  return { kind: 'ChromaticAberrationEffect', ...options };
}
