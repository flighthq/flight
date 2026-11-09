import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { VolumetricLightEffect } from './types/VolumetricLightEffect.ts';

export function createVolumetricLightEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VolumetricLightEffect>, 'kind'>> = {},
): VolumetricLightEffect {
  const out = allocateEntity<VolumetricLightEffect>();
  initializeVolumetricLightEffect(out, options);
  return out;
}

export function initializeVolumetricLightEffect(
  out: EntityConstruction<VolumetricLightEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<VolumetricLightEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'VolumetricLightEffect');
  out.density = options.density;
  out.lightColor = options.lightColor;
  out.lightX = options.lightX;
  out.lightY = options.lightY;
  out.samples = options.samples;
  out.scattering = options.scattering;
}
