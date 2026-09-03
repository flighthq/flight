import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, ChromaticAberrationEffect } from '@flighthq/types/contract';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ChromaticAberrationEffect>, 'kind'>> = {},
): ChromaticAberrationEffect {
  return createEntity({ kind: 'ChromaticAberrationEffect', ...options });
}
