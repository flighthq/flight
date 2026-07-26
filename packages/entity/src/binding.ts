import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createEntityRuntime, getEntityRuntime } from './runtime';

export function attachEntityBinding(entity: Entity, binding: object): void {
  if (entity[EntityRuntimeKey] === undefined) {
    entity[EntityRuntimeKey] = createEntityRuntime();
  }
  entity[EntityRuntimeKey].binding = binding;
}

export function getEntityBinding(source: Entity): object | null {
  const runtime = getEntityRuntime(source);
  return runtime?.binding ?? null;
}
