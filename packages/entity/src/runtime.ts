import type { Entity, EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createEntityRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function createNodeRuntime(): EntityRuntime {
  return createEntityRuntime();
}

export function getEntityRuntime(source: Readonly<Entity>): Readonly<EntityRuntime> {
  return source[EntityRuntimeKey]!;
}
