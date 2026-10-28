import { readEntityRuntime } from './entity.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

type EntityWithCompatibilityRuntime = EntityRaw & {
  [EntityRuntimeKey]?: EntityRuntime;
};

export function createEntityRuntime(): EntityRuntime {
  return {
    binding: null,
  };
}

export function getEntityRuntime(source: Readonly<EntityRaw>): Readonly<EntityRuntime> {
  return (source as Readonly<EntityWithCompatibilityRuntime>)[EntityRuntimeKey] ?? readEntityRuntime(source)!;
}

// Returns true when either the package-owned compatibility slot or private Entity runtime exists.
// A fresh or cloned entity has neither and returns false.
export function hasEntityRuntime(source: Readonly<EntityRaw>): boolean {
  return (
    (source as Readonly<EntityWithCompatibilityRuntime>)[EntityRuntimeKey] !== undefined ||
    readEntityRuntime(source) !== undefined
  );
}
