import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, SketchEffect } from '@flighthq/types/contract';

export function createSketchEffect(
  options: Readonly<Omit<EntityWithoutRuntime<SketchEffect>, 'kind'>> = {},
): SketchEffect {
  return createEntity({ kind: 'SketchEffect', ...options });
}
