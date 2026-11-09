import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { SketchEffect } from './types/SketchEffect.ts';

export function createSketchEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SketchEffect>, 'kind'>> = {},
): SketchEffect {
  const out = allocateEntity<SketchEffect>();
  initializeSketchEffect(out, options);
  return out;
}

export function initializeSketchEffect(
  out: EntityConstruction<SketchEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<SketchEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'SketchEffect');
  out.strength = options.strength;
}
