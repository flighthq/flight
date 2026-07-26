import type { ChromaticAberrationEffect } from '@flighthq/types/contract';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<ChromaticAberrationEffect, 'kind'>> = {},
): ChromaticAberrationEffect {
  return { kind: 'ChromaticAberrationEffect', ...options };
}
