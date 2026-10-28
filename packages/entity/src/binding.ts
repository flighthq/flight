import { readEntityRuntime, writeEntityRuntime } from './entity.ts';
import { createEntityRuntime } from './runtime.ts';
import type { EntityRaw } from './types.ts';

const EntityWrappers = new WeakMap<EntityRaw, object>();

export function attachEntityBinding(entity: EntityRaw, binding: object): void {
  const runtime = readEntityRuntime(entity) ?? createEntityRuntime();
  runtime.binding = binding;
  writeEntityRuntime(entity, runtime);
}

// OOP identity is deliberately separate from the legacy provider/native binding slot. Providers
// remain replaceable, while a raw entity can acquire only one wrapper for its lifetime.
export function attachEntityWrapper(entity: EntityRaw, wrapper: object): void {
  const existing = EntityWrappers.get(entity);
  if (existing !== undefined && existing !== wrapper) {
    throw new TypeError('An EntityRaw object cannot be attached to more than one OOP wrapper');
  }
  EntityWrappers.set(entity, wrapper);
}

export function detachEntityBinding(entity: EntityRaw): void {
  const runtime = readEntityRuntime(entity);
  if (runtime !== undefined) runtime.binding = null;
}

export function getEntityBinding(source: Readonly<EntityRaw>): object | null {
  return readEntityRuntime(source)?.binding ?? null;
}

export function getEntityBindingAs<Type>(source: Readonly<EntityRaw>): Type | null {
  return getEntityBinding(source) as Type | null;
}

export function getEntityWrapperAs<Type>(source: Readonly<EntityRaw>): Type | null {
  return (EntityWrappers.get(source) as Type | undefined) ?? null;
}

export function hasEntityBinding(source: Readonly<EntityRaw>): boolean {
  return getEntityBinding(source) !== null;
}
