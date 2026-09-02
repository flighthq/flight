import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createEntityRuntime } from './runtime';

export function attachEntityBinding(entity: Entity, binding: object): void {
  if (entity[EntityRuntimeKey] === undefined) {
    entity[EntityRuntimeKey] = createEntityRuntime();
  }
  entity[EntityRuntimeKey].binding = binding;
}

export function detachEntityBinding(entity: Entity): void {
  const runtime = entity[EntityRuntimeKey];
  if (runtime !== undefined) runtime.binding = null;
}

export function getEntityBinding(source: Readonly<Entity>): object | null {
  return source[EntityRuntimeKey]?.binding ?? null;
}

export function getEntityBindingAs<Type>(source: Readonly<Entity>): Type | null {
  return getEntityBinding(source) as Type | null;
}

export function hasEntityBinding(source: Readonly<Entity>): boolean {
  return getEntityBinding(source) !== null;
}
