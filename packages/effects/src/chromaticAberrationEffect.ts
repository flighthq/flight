import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ChromaticAberrationEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

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
  initializeRenderEffect(out, 'ChromaticAberrationEffect');
  out.intensity = options.intensity;
  out.radial = options.radial;
}
