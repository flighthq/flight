import type { Entity } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

import { createRuntime, getRuntime } from './runtime';

export function attachBinding(entity: Entity, binding: object): void {
  if (entity[RuntimeKey] === undefined) {
    entity[RuntimeKey] = createRuntime();
  }
  entity[RuntimeKey].binding = binding;
}

export function getBinding(source: Entity): object | null {
  const runtime = getRuntime(source);
  return runtime?.binding ?? null;
}
