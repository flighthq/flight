import type { Entity, EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function getRuntime(source: Readonly<Entity>): Readonly<EntityRuntime> {
  return source[EntityRuntimeKey]!;
}
