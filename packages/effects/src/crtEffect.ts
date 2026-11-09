import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { CrtEffect } from './types/CrtEffect.ts';

export function createCrtEffect(options: Readonly<Omit<EntityWithoutRuntime<CrtEffect>, 'kind'>> = {}): CrtEffect {
  const out = allocateEntity<CrtEffect>();
  initializeCrtEffect(out, options);
  return out;
}

export function initializeCrtEffect(
  out: EntityConstruction<CrtEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<CrtEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'CrtEffect');
  out.curvature = options.curvature;
  out.scanlineIntensity = options.scanlineIntensity;
  out.vignette = options.vignette;
  out.aberration = options.aberration;
}
