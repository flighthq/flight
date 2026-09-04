import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { allocateEntity, finishEntity } from './entity';
import { getEntityUid, setEntityUid } from './entityUid';
import { createEntityRuntime } from './runtime';

function createTestEntity(): Entity {
  return finishEntity(allocateEntity<Entity>());
}

describe('getEntityUid', () => {
  it('has no uid property on an untouched runtime before any access', () => {
    const entity = createTestEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();
    expect('uid' in entity[EntityRuntimeKey]!).toBe(false);
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
    expect(entity[EntityRuntimeKey]).toBeDefined();
  });
});

describe('setEntityUid', () => {
  it('sets a stable id before any get', () => {
    const entity = createTestEntity();
    setEntityUid(entity, 'my-stable-id');
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
    expect(entity[EntityRuntimeKey]).toBeDefined();
    expect(getEntityUid(entity)).toBe('pre-bind');
  });
});
