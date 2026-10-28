import { allocateEntity, finishEntity, writeEntityRuntime } from './entity.ts';
import { getEntityUid, setEntityUid } from './entityUid.ts';
import { createEntityRuntime, getEntityRuntime } from './runtime.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

type TestEntity = EntityRaw & { [EntityRuntimeKey]: EntityRuntime | undefined };

function createTestEntity(): TestEntity {
  return finishEntity(allocateEntity<TestEntity>());
}

describe('getEntityUid', () => {
  it('has no uid property on an untouched runtime before any access', () => {
    const entity = createTestEntity();
    writeEntityRuntime(entity, createEntityRuntime());
    expect('uid' in getEntityRuntime(entity)).toBe(false);
  });

  it('lazily generates a uid on first access', () => {
    const entity = createTestEntity();
    const uid = getEntityUid(entity);
    expect(uid).toEqual(expect.any(String));
    expect(uid.length).toBeGreaterThan(0);
  });

  it('returns the same uid on repeated access', () => {
    const entity = createTestEntity();
    const first = getEntityUid(entity);
    const second = getEntityUid(entity);
    expect(second).toBe(first);
  });

  it('generates distinct uids for different entities', () => {
    const a = createTestEntity();
    const b = createTestEntity();
    expect(getEntityUid(a)).not.toBe(getEntityUid(b));
  });

  it('creates the runtime if the entity has none', () => {
    const entity = createTestEntity();
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    getEntityUid(entity);
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    expect(getEntityRuntime(entity)).toBeDefined();
  });
});

describe('setEntityUid', () => {
  it('sets a stable id before any get', () => {
    const entity = createTestEntity();
    setEntityUid(entity, 'my-stable-id');
    const forgedRuntime = createEntityRuntime();
    forgedRuntime.uid = 'forged';
    entity[EntityRuntimeKey] = forgedRuntime;

    expect(getEntityUid(entity)).toBe('my-stable-id');
  });

  it('replaces a previously generated uid', () => {
    const entity = createTestEntity();
    const generated = getEntityUid(entity);
    setEntityUid(entity, 'override');
    expect(getEntityUid(entity)).toBe('override');
    expect(getEntityUid(entity)).not.toBe(generated);
  });

  it('creates the runtime if the entity has none', () => {
    const entity = createTestEntity();
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    setEntityUid(entity, 'pre-bind');
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    expect(getEntityRuntime(entity)).toBeDefined();
    expect(getEntityUid(entity)).toBe('pre-bind');
  });
});
