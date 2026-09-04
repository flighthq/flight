import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, SketchEffect } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createSketchEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SketchEffect>, 'kind'>> = {},
): SketchEffect {
  const out = allocateEntity<SketchEffect>();
  initializeSketchEffect(out, options);
  return finishEntity(out);
}

export function initializeSketchEffect(
  out: EntityConstruction<SketchEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SketchEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'SketchEffect');
  out.strength = options.strength;
}
