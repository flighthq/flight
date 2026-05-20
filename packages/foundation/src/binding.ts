import type { Entity } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createRuntime, getRuntime } from './runtime';

export function attachBinding(entity: Entity, binding: object): void {
  if (entity[EntityRuntimeKey] === undefined) {
    entity[EntityRuntimeKey] = createRuntime();
  }
  entity[EntityRuntimeKey].binding = binding;
}

export function getBinding(source: Entity): object | null {
  const runtime = getRuntime(source);
  return runtime?.binding ?? null;
}
