import type { Entity, EntityRuntime, NodeRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createEntityRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function createNodeRuntime(): NodeRuntime {
  return createEntityRuntime() as NodeRuntime;
}

export function getEntityRuntime(source: Readonly<Entity>): Readonly<EntityRuntime> {
  return source[EntityRuntimeKey]!;
}
