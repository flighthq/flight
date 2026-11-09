import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { RadialBlurEffect } from './types/RadialBlurEffect.ts';

export function createRadialBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<RadialBlurEffect>, 'kind'>> = {},
): RadialBlurEffect {
  const out = allocateEntity<RadialBlurEffect>();
  initializeRadialBlurEffect(out, options);
  return out;
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
