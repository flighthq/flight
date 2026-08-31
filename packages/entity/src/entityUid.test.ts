import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createEntity } from './entity';
import { getEntityUid, setEntityUid } from './entityUid';
import { createEntityRuntime } from './runtime';

describe('getEntityUid', () => {
  it('returns null uid on an untouched runtime before any access', () => {
    const entity = createEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();
    expect(entity[EntityRuntimeKey]!.uid).toBeNull();
  });

  it('lazily generates a uid on first access', () => {
    const entity = createEntity();
    const uid = getEntityUid(entity);
    expect(uid).toEqual(expect.any(String));
    expect(uid.length).toBeGreaterThan(0);
  });

  it('returns the same uid on repeated access', () => {
    const entity = createEntity();
    const first = getEntityUid(entity);
    const second = getEntityUid(entity);
    expect(second).toBe(first);
  });

  it('generates distinct uids for different entities', () => {
    const a = createEntity();
    const b = createEntity();
    expect(getEntityUid(a)).not.toBe(getEntityUid(b));
  });

  it('creates the runtime if the entity has none', () => {
    const entity = createEntity();
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    getEntityUid(entity);
    expect(entity[EntityRuntimeKey]).toBeDefined();
  });
});

describe('setEntityUid', () => {
  it('sets a stable id before any get', () => {
    const entity = createEntity();
    setEntityUid(entity, 'my-stable-id');
    expect(getEntityUid(entity)).toBe('my-stable-id');
  });

  it('replaces a previously generated uid', () => {
    const entity = createEntity();
    const generated = getEntityUid(entity);
    setEntityUid(entity, 'override');
    expect(getEntityUid(entity)).toBe('override');
    expect(getEntityUid(entity)).not.toBe(generated);
  });

  it('creates the runtime if the entity has none', () => {
    const entity = createEntity();
    expect(entity[EntityRuntimeKey]).toBeUndefined();
    setEntityUid(entity, 'pre-bind');
    expect(entity[EntityRuntimeKey]).toBeDefined();
    expect(getEntityUid(entity)).toBe('pre-bind');
  });
});
