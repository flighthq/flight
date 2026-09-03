import { createEntity } from '@flighthq/entity/contract';
import type { ChromaticAberrationEffect } from '@flighthq/types/contract';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<ChromaticAberrationEffect, 'kind'>> = {},
): ChromaticAberrationEffect {
  return createEntity({ kind: 'ChromaticAberrationEffect', ...options });
}
