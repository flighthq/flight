import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ChromaticAberrationEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createChromaticAberrationEffect(
  options: Readonly<Omit<EntityWithoutRuntime<ChromaticAberrationEffect>, 'kind'>> = {},
): ChromaticAberrationEffect {
  const out = allocateEntity<ChromaticAberrationEffect>();
  initializeChromaticAberrationEffect(out, options);
  return finishEntity(out);
}

export function initializeChromaticAberrationEffect(
  out: EntityConstruction<ChromaticAberrationEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<ChromaticAberrationEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'ChromaticAberrationEffect');
  out.intensity = options.intensity;
  out.radial = options.radial;
}
