import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, VolumetricLightEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createVolumetricLightEffect(
  options: Readonly<Omit<EntityWithoutRuntime<VolumetricLightEffect>, 'kind'>> = {},
): VolumetricLightEffect {
  const out = allocateEntity<VolumetricLightEffect>();
  initializeVolumetricLightEffect(out, options);
  return finishEntity(out);
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
