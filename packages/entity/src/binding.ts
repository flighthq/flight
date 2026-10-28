import { readEntityRuntime, writeEntityRuntime } from './entity.ts';
import { createEntityRuntime } from './runtime.ts';
import type { EntityRaw } from './types.ts';

export function attachEntityBinding(entity: EntityRaw, binding: object): void {
  const runtime = readEntityRuntime(entity) ?? createEntityRuntime();
  runtime.binding = binding;
  writeEntityRuntime(entity, runtime);
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

export function hasEntityBinding(source: Readonly<EntityRaw>): boolean {
  return getEntityBinding(source) !== null;
}
