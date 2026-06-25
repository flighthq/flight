import type { Entity, EntityWithoutRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';

// Allocates a new entity by copying the public data fields of the source, with the runtime
// slot reset to undefined. The clone is a fresh, unbound entity — runtime and binding are
// intentionally not carried over.
export function cloneEntity<Type extends Entity>(source: Readonly<Type>): Type {
  const copy = { ...source } as Record<PropertyKey, unknown>;
  copy[EntityRuntimeKey] = undefined;
  return createEntity(copy as unknown as Type);
}

// Returns a plain object with the EntityRuntimeKey slot removed, ready to pass to a
// serializer or JSON.stringify. The runtime is explicitly non-serializable; this helper
// provides the one canonical strip path so each consuming package does not need to know
// about the slot key.
export function stripEntityRuntime<Type extends Entity>(source: Readonly<Type>): EntityWithoutRuntime<Type> {
  const copy = { ...source } as Record<PropertyKey, unknown>;
  delete copy[EntityRuntimeKey];
  return copy as unknown as EntityWithoutRuntime<Type>;
}
