import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { HalftoneEffect } from './types/HalftoneEffect.ts';

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
