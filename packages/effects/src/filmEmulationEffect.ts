import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, FilmEmulationEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createFilmEmulationEffect(
  options: Readonly<Omit<EntityWithoutRuntime<FilmEmulationEffect>, 'kind'>> = {},
): FilmEmulationEffect {
  const out = allocateEntity<FilmEmulationEffect>();
  initializeFilmEmulationEffect(out, options);
  return finishEntity(out);
}

export function initializeFilmEmulationEffect(
  out: EntityConstruction<FilmEmulationEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<FilmEmulationEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'FilmEmulationEffect');
  out.gateWeave = options.gateWeave;
  out.grainIntensity = options.grainIntensity;
  out.halationRadius = options.halationRadius;
  out.halationStrength = options.halationStrength;
}
