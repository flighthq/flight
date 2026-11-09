import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { LensFlareEffect } from './types/LensFlareEffect.ts';

export function createLensFlareEffect(
  options: Readonly<Omit<EntityWithoutRuntime<LensFlareEffect>, 'kind'>> = {},
): LensFlareEffect {
  const out = allocateEntity<LensFlareEffect>();
  initializeLensFlareEffect(out, options);
  return out;
}

export function initializeLensFlareEffect(
  out: EntityConstruction<LensFlareEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<LensFlareEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'LensFlareEffect');
  out.threshold = options.threshold;
  out.intensity = options.intensity;
  out.ghosts = options.ghosts;
  out.halo = options.halo;
}
