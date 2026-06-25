import type { Entity, EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createEntityRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function getEntityRuntime(source: Readonly<Entity>): Readonly<EntityRuntime> {
  return source[EntityRuntimeKey]!;
}

// Returns true when the entity's runtime slot has been allocated — i.e. the entity has been
// bound (attachEntityBinding) or otherwise given a runtime. A fresh or cloned entity has no
// runtime and returns false.
export function hasEntityRuntime(source: Readonly<Entity>): boolean {
  return source[EntityRuntimeKey] !== undefined;
}
