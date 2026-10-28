import type { Entity, EntityConstruction, EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

const EntityRuntimePrivate = Symbol('EntityRuntimePrivate');

type EntityWithPrivateRuntime = EntityRaw & {
  [EntityRuntimePrivate]: EntityRuntime | undefined;
};

export function allocateEntity(): EntityConstruction<Entity>;
export function allocateEntity<Type extends EntityRaw>(): EntityConstruction<Type>;
export function allocateEntity<Type extends EntityRaw>(): EntityConstruction<Type> {
  const out = {} as EntityConstruction<Type> & EntityWithPrivateRuntime;
  Object.defineProperty(out, EntityRuntimePrivate, {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: true,
  });
  return out;
}

export function finishEntity<Type extends EntityRaw>(out: EntityConstruction<Type>): Type {
  return out as Type;
}

// Package-private compiler seam. These functions are intentionally omitted from contract.ts; keeping
// the symbol in this module lets the deprecated EntityRuntimeKey bridge disappear later without
// changing EntityRaw or any generated record field.
export function readEntityRuntime(source: Readonly<EntityRaw>): EntityRuntime | undefined {
  if (Object.prototype.hasOwnProperty.call(source, EntityRuntimeKey)) {
    return (source as Readonly<Entity>)[EntityRuntimeKey];
  }
  return (source as Readonly<EntityWithPrivateRuntime>)[EntityRuntimePrivate];
}

export function writeEntityRuntime(source: EntityRaw, runtime: EntityRuntime | undefined): void {
  (source as EntityWithPrivateRuntime)[EntityRuntimePrivate] = runtime;
  Object.defineProperty(source, EntityRuntimeKey, {
    configurable: true,
    enumerable: false,
    value: runtime,
    writable: true,
  });
}
