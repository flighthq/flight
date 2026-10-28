import { attachEntityBinding, getEntityBinding } from './binding.ts';
import { allocateEntity, finishEntity, writeEntityRuntime } from './entity.ts';
import { createEntityRuntime, getEntityRuntime, hasEntityRuntime } from './runtime.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

type TestEntity = EntityRaw & { [EntityRuntimeKey]: EntityRuntime | undefined };

function createTestEntity(): TestEntity {
  return finishEntity(allocateEntity<TestEntity>());
}

describe('createEntityRuntime', () => {
  it('returns an object', () => {
    const runtime = createEntityRuntime();
    expect(runtime).not.toBeNull();
  });

  it('has a null api slot', () => {
    const runtime = createEntityRuntime();
    expect(runtime.binding).toBeNull();
  });
});

describe('getEntityRuntime', () => {
  it('returns the runtime object', () => {
    const entity = createTestEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    const runtime = {} as EntityRuntime;
    writeEntityRuntime(entity, runtime);
    expect(getEntityRuntime(entity)).toStrictEqual(runtime);
  });

  it('prefers a defined package runtime while binding remains private-authoritative', () => {
    const entity = createTestEntity();
    const packageRuntime = Object.assign(createEntityRuntime(), { packageState: 7 });
    const binding = {};
    entity[EntityRuntimeKey] = packageRuntime;

    attachEntityBinding(entity, binding);

    expect(getEntityRuntime(entity)).toBe(packageRuntime);
    expect(getEntityBinding(entity)).toBe(binding);
    expect(packageRuntime.binding).toBeNull();
  });

  it('does not expose a private runtime through the compatibility slot', () => {
    const entity = createTestEntity();

    attachEntityBinding(entity, {});

    expect(entity[EntityRuntimeKey]).toBeUndefined();
    expect(getEntityRuntime(entity)).toBeDefined();
  });
});

describe('hasEntityRuntime', () => {
  it('returns false for a fresh entity', () => {
    const entity = createTestEntity();
    expect(hasEntityRuntime(entity)).toBe(false);
  });

  it('returns true after a binding is attached', () => {
    const entity = createTestEntity();
    attachEntityBinding(entity, {});
    expect(hasEntityRuntime(entity)).toBe(true);
  });

  it('returns true for package runtime state without a private runtime', () => {
    const entity = createTestEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();

    expect(hasEntityRuntime(entity)).toBe(true);
  });
});
