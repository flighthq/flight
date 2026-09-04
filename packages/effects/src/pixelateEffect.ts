import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, PixelateEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createPixelateEffect(
  options: Readonly<Omit<EntityWithoutRuntime<PixelateEffect>, 'kind'>> = {},
): PixelateEffect {
  const out = allocateEntity<PixelateEffect>();
  initializePixelateEffect(out, options);
  return finishEntity(out);
}

export function initializePixelateEffect(
  out: EntityConstruction<PixelateEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<PixelateEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'PixelateEffect');
  out.size = options.size;
}
