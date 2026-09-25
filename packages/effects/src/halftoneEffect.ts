import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, HalftoneEffect } from '@flighthq/types/contract';

import { initializeEffect } from './effect.ts';

export function createHalftoneEffect(
  options: Readonly<Omit<EntityWithoutRuntime<HalftoneEffect>, 'kind'>> = {},
): HalftoneEffect {
  const out = allocateEntity<HalftoneEffect>();
  initializeHalftoneEffect(out, options);
  return finishEntity(out);
}

export function initializeHalftoneEffect(
  out: EntityConstruction<HalftoneEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<HalftoneEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'HalftoneEffect');
  out.scale = options.scale;
  out.angle = options.angle;
}
