import type { Entity } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

import { createRuntime, getRuntime } from './runtime';

export function attachAPI(entity: Entity, api: object): void {
  if (entity[RuntimeKey] === undefined) {
    entity[RuntimeKey] = createRuntime();
  }
  entity[RuntimeKey].api = api;
}

export function getAPI(source: Entity): object | null {
  const runtime = getRuntime(source);
  return runtime?.api ?? null;
}
