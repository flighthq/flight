import {
  attachEntityBinding,
  detachEntityBinding,
  getEntityBinding,
  getEntityBindingAs,
  hasEntityBinding,
} from './binding.ts';
import { allocateEntity, finishEntity, writeEntityRuntime } from './entity.ts';
import { createEntityRuntime, getEntityRuntime } from './runtime.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

type TestEntity = EntityRaw & { [EntityRuntimeKey]: EntityRuntime | undefined };

function createTestEntity(): TestEntity {
  return finishEntity(allocateEntity<TestEntity>());
}

describe('attachEntityBinding', () => {
  it('creates a runtime object if none is present', () => {
    const entity = createTestEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    attachEntityBinding(entity, {});
    expect(getEntityRuntime(entity)).not.toBeUndefined();
  });

  it('keeps the private binding authoritative when compatibility state is replaced', () => {
    const entity = createTestEntity();
    const binding = {};
    attachEntityBinding(entity, binding);
    const forgedRuntime = createEntityRuntime();
    forgedRuntime.binding = { forged: true };
    entity[EntityRuntimeKey] = forgedRuntime;

    expect(getEntityBinding(entity)).toBe(binding);
    expect(getEntityRuntime(entity)).toBe(forgedRuntime);
  });

  it('preserves an existing runtime while assigning its binding', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    const binding = {};
    writeEntityRuntime(entity, runtime);

    attachEntityBinding(entity, binding);

    expect(getEntityRuntime(entity)).toBe(runtime);
    expect(runtime.binding).toBe(binding);
  });

  it('preserves package-owned compatibility state on a privately tracked entity', () => {
    const entity = createTestEntity();
    const packageRuntime = Object.assign(createEntityRuntime(), { packageState: 7 });
    const binding = {};
    entity[EntityRuntimeKey] = packageRuntime;

    attachEntityBinding(entity, binding);

    expect(entity[EntityRuntimeKey]).toBe(packageRuntime);
    expect((entity[EntityRuntimeKey] as typeof packageRuntime).packageState).toBe(7);
    expect(packageRuntime.binding).toBeNull();
    expect(getEntityBinding(entity)).toBe(binding);

    detachEntityBinding(entity);

    expect(entity[EntityRuntimeKey]).toBe(packageRuntime);
    expect(getEntityBinding(entity)).toBeNull();
  });
});

describe('detachEntityBinding', () => {
  it('clears the binding while preserving the runtime', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    runtime.binding = {};
    writeEntityRuntime(entity, runtime);

    detachEntityBinding(entity);

    expect(entity[EntityRuntimeKey]).toBeUndefined();
    expect(getEntityRuntime(entity)).toBe(runtime);
    expect(runtime.binding).toBeNull();
  });

  it('does not allocate a runtime when no binding exists', () => {
    const entity = createTestEntity();

    detachEntityBinding(entity);

    expect(entity[EntityRuntimeKey]).toBeUndefined();
  });
});

describe('getEntityBinding', () => {
  it('returns null if the entity has no runtime', () => {
    const entity = createTestEntity();
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns null if the binding slot is empty', () => {
    const entity = createTestEntity();
    writeEntityRuntime(entity, createEntityRuntime());
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns the binding slot if set', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    runtime.binding = {};
    writeEntityRuntime(entity, runtime);
    expect(getEntityBinding(entity)).toStrictEqual(runtime.binding);
  });

  it('accepts a readonly entity', () => {
    const entity: Readonly<TestEntity> = createTestEntity();
    expect(getEntityBinding(entity)).toBeNull();
  });
});

describe('getEntityBindingAs', () => {
  it('returns the binding with the caller-owned type', () => {
    const entity = createTestEntity();
    const binding = { name: 'wrapper' };
    attachEntityBinding(entity, binding);

    const result = getEntityBindingAs<{ name: string }>(entity);

    expectTypeOf(result).toEqualTypeOf<{ name: string } | null>();
    expect(result).toBe(binding);
  });

  it('returns null if no binding exists', () => {
    const entity: Readonly<TestEntity> = createTestEntity();
    expect(getEntityBindingAs<{ name: string }>(entity)).toBeNull();
  });
});

describe('hasEntityBinding', () => {
  it('returns false if the entity has no runtime', () => {
    const entity: Readonly<TestEntity> = createTestEntity();
    expect(hasEntityBinding(entity)).toBe(false);
  });

  it('returns false if the binding slot is empty', () => {
    const entity = createTestEntity();
    writeEntityRuntime(entity, createEntityRuntime());
    expect(hasEntityBinding(entity)).toBe(false);
  });

  it('returns true if a binding exists', () => {
    const entity = createTestEntity();
    attachEntityBinding(entity, {});
    expect(hasEntityBinding(entity)).toBe(true);
  });
});

describe('legacy compatibility runtime', () => {
  it('promotes an external runtime before mutating it and clears the bridge', () => {
    const legacyRuntime = createEntityRuntime();
    const entity = { [EntityRuntimeKey]: legacyRuntime };
    const binding = {};

    attachEntityBinding(entity, binding);

    expect(entity[EntityRuntimeKey]).toBeUndefined();
    expect(legacyRuntime.binding).toBeNull();
    expect(getEntityRuntime(entity)).not.toBe(legacyRuntime);
    expect(getEntityRuntime(entity).binding).toBe(binding);
  });
});
