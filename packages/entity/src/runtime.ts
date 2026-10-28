import { readEntityRuntime } from './entity.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';

export function createEntityRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function getEntityRuntime(source: Readonly<EntityRaw>): Readonly<EntityRuntime> {
  return readEntityRuntime(source)!;
}

// Returns true when the entity's runtime slot has been allocated — i.e. the entity has been
// bound (attachEntityBinding) or otherwise given a runtime. A fresh or cloned entity has no
// runtime and returns false.
export function hasEntityRuntime(source: Readonly<EntityRaw>): boolean {
  return readEntityRuntime(source) !== undefined;
}
