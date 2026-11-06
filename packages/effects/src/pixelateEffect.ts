import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { PixelateEffect } from './types/PixelateEffect.ts';

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
  initializeEffect(out, 'PixelateEffect');
  out.size = options.size;
}
