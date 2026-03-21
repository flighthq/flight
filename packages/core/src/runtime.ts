import type { Entity, Runtime } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

export function createRuntime(): Runtime {
  return {
    api: null,
  };
}

export function getRuntime(source: Readonly<Entity>): Readonly<Runtime> {
  return source[RuntimeKey]!;
}
