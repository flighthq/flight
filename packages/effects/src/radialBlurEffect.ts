import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, RadialBlurEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect';

export function createRadialBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<RadialBlurEffect>, 'kind'>> = {},
): RadialBlurEffect {
  const out = allocateEntity<RadialBlurEffect>();
  initializeRadialBlurEffect(out, options);
  return finishEntity(out);
}

export function initializeRadialBlurEffect(
  out: EntityConstruction<RadialBlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<RadialBlurEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'RadialBlurEffect');
  out.centerX = options.centerX;
  out.centerY = options.centerY;
  out.strength = options.strength;
  out.samples = options.samples;
}
