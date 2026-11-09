import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { ChromaticAberrationEffect } from './types/ChromaticAberrationEffect.ts';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ChromaticAberrationEffect>, 'kind'>> = {},
): ChromaticAberrationEffect {
  const out = allocateEntity<ChromaticAberrationEffect>();
  initializeChromaticAberrationEffect(out, options);
  return out;
}

export function initializeChromaticAberrationEffect(
  out: EntityConstruction<ChromaticAberrationEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ChromaticAberrationEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ChromaticAberrationEffect');
  out.intensity = options.intensity;
  out.radial = options.radial;
}
