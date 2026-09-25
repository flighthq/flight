import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CrtEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createCrtEffect(options: Readonly<Omit<EntityWithoutRuntime<CrtEffect>, 'kind'>> = {}): CrtEffect {
  const out = allocateEntity<CrtEffect>();
  initializeCrtEffect(out, options);
  return finishEntity(out);
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
