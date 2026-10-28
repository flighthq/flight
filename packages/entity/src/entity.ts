import type { EntityConstruction, EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

const EntityRuntimes = /* @__PURE__ */ new WeakMap<EntityRaw, EntityRuntime | undefined>();
const EntityWrappers = /* @__PURE__ */ new WeakMap<EntityRaw, Entity>();

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
  const out = {} as EntityConstruction<Type> & EntityWithCompatibilityRuntime;
  EntityRuntimes.set(out, undefined);
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

// Package-private compiler seam. These functions are intentionally omitted from contract.ts; the
// WeakMap is the live runtime store while EntityRuntimeKey remains an undefined compatibility bridge.
export function readEntityRuntime(source: Readonly<EntityRaw>): EntityRuntime | undefined {
  if (EntityRuntimes.has(source)) return EntityRuntimes.get(source);
  if (Object.prototype.hasOwnProperty.call(source, EntityRuntimeKey)) {
    return (source as Readonly<EntityWithCompatibilityRuntime>)[EntityRuntimeKey];
  }
  return undefined;
}

export function writeEntityRuntime(source: EntityRaw, runtime: EntityRuntime | undefined): void {
  const hasPrivateRuntime = EntityRuntimes.has(source);
  let privateRuntime = runtime;
  if (
    runtime !== undefined &&
    !hasPrivateRuntime &&
    Object.prototype.hasOwnProperty.call(source, EntityRuntimeKey) &&
    (source as EntityWithCompatibilityRuntime)[EntityRuntimeKey] === runtime
  ) {
    privateRuntime = { ...runtime };
  }
  EntityRuntimes.set(source, privateRuntime);
  if (hasPrivateRuntime) return;
  Object.defineProperty(source, EntityRuntimeKey, {
    configurable: true,
    enumerable: false,
    value: undefined,
    writable: true,
  });
}
