import type { EntityConstruction, EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

const EntityRuntimePrivate = Symbol('EntityRuntimePrivate');
const EntityWrappers = new WeakMap<EntityRaw, Entity>();

type EntityWithPrivateRuntime = EntityRaw & {
  [EntityRuntimePrivate]: EntityRuntime | undefined;
};

type EntityWithCompatibilityRuntime = EntityRaw & {
  [EntityRuntimeKey]: EntityRuntime | undefined;
};

export class Entity {
  readonly raw: EntityRaw;

  constructor(raw: EntityRaw = finishEntity(allocateEntity<EntityRaw>())) {
    this.raw = raw;
    attachEntityWrapper(raw, this);
  }

  static create(): Entity {
    return new Entity();
  }

  static from(raw: EntityRaw): Entity {
    return getEntityWrapperAs<Entity>(raw) ?? new Entity(raw);
  }
}

export function allocateEntity<
  Type extends EntityRaw = EntityRaw & { [EntityRuntimeKey]: EntityRuntime | undefined },
>(): EntityConstruction<Type> {
  const out = {} as EntityConstruction<Type> & EntityWithCompatibilityRuntime & EntityWithPrivateRuntime;
  Object.defineProperty(out, EntityRuntimePrivate, {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: true,
  });
  Object.defineProperty(out, EntityRuntimeKey, {
    configurable: true,
    enumerable: false,
    value: undefined,
    writable: true,
  });
  return out;
}

// OOP identity is deliberately separate from the legacy provider/native binding slot. Providers
// remain replaceable, while a raw entity can acquire only one wrapper for its lifetime.
export function attachEntityWrapper(entity: EntityRaw, wrapper: Entity): void {
  const existing = EntityWrappers.get(entity);
  if (existing !== undefined && existing !== wrapper) {
    throw new TypeError('An EntityRaw object cannot be attached to more than one OOP wrapper');
  }
  EntityWrappers.set(entity, wrapper);
}

export function finishEntity<Type extends EntityRaw>(out: EntityConstruction<Type>): Type {
  return out as Type;
}

export function getEntityWrapperAs<Type extends Entity>(source: Readonly<EntityRaw>): Type | null {
  return (EntityWrappers.get(source) as Type | undefined) ?? null;
}

// Package-private compiler seam. These functions are intentionally omitted from contract.ts; keeping
// the symbol in this module lets the deprecated EntityRuntimeKey bridge disappear later without
// changing EntityRaw or any generated record field.
export function readEntityRuntime(source: Readonly<EntityRaw>): EntityRuntime | undefined {
  if (Object.prototype.hasOwnProperty.call(source, EntityRuntimeKey)) {
    return (source as Readonly<EntityWithCompatibilityRuntime>)[EntityRuntimeKey];
  }
  return (source as Readonly<EntityWithPrivateRuntime>)[EntityRuntimePrivate];
}

export function writeEntityRuntime(source: EntityRaw, runtime: EntityRuntime | undefined): void {
  if (Object.prototype.hasOwnProperty.call(source, EntityRuntimePrivate)) {
    (source as EntityWithPrivateRuntime)[EntityRuntimePrivate] = runtime;
  } else {
    Object.defineProperty(source, EntityRuntimePrivate, {
      configurable: false,
      enumerable: false,
      value: runtime,
      writable: true,
    });
  }
  Object.defineProperty(source, EntityRuntimeKey, {
    configurable: true,
    enumerable: false,
    value: runtime,
    writable: true,
  });
}
