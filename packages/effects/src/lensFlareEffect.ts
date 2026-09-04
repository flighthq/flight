import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, LensFlareEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createLensFlareEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensFlareEffect>, 'kind'>> = {},
): LensFlareEffect {
  const out = allocateEntity<LensFlareEffect>();
  initializeLensFlareEffect(out, options);
  return finishEntity(out);
}

export function initializeLensFlareEffect(
  out: EntityConstruction<LensFlareEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<LensFlareEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'LensFlareEffect');
  out.threshold = options.threshold;
  out.intensity = options.intensity;
  out.ghosts = options.ghosts;
  out.halo = options.halo;
}
