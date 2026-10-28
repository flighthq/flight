import { allocateEntity, finishEntity } from './entity.ts';
import type { EntityRaw, EntityWithoutRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

// Allocates a new entity by copying the public data fields of the source, with the runtime
// slot reset to undefined. The clone is a fresh, unbound entity — runtime, provider binding, and
// private OOP wrapper identity are intentionally not carried over.
export function cloneEntity<Type extends EntityRaw>(source: Readonly<Type>): Type {
  const copy = allocateEntity<Type>();
  Object.assign(copy, source);
  delete (copy as Record<PropertyKey, unknown>)[EntityRuntimeKey];
  return finishEntity(copy);
}

// Returns a plain object with the EntityRuntimeKey slot removed, ready to pass to a
// serializer or JSON.stringify. The runtime is explicitly non-serializable; this helper
// provides the one canonical strip path so each consuming package does not need to know
// about the slot key.
export function stripEntityRuntime<Type extends EntityRaw>(source: Readonly<Type>): EntityWithoutRuntime<Type> {
  const copy = { ...source } as Record<PropertyKey, unknown>;
  delete copy[EntityRuntimeKey];
  return copy as unknown as EntityWithoutRuntime<Type>;
}
