import { EntityRuntimeKey } from '@flighthq/types';

import { attachEntityBinding, getEntityBinding } from './binding';
import { createEntity } from './entity';
import { createEntityRuntime, getEntityRuntime } from './runtime';

describe('attachEntityBinding', () => {
  it('creates a runtime object if none is present', () => {
    const entity = createEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    attachEntityBinding(entity, {});
    expect(getEntityRuntime(entity)).not.toBeUndefined();
  });

  it('assigns to the binding slot', () => {
    const entity = createEntity();
    const binding = {};
    attachEntityBinding(entity, binding);
    expect(getEntityRuntime(entity).binding).toStrictEqual(binding);
  });
});

describe('getEntityBinding', () => {
  it('returns null if the entity has no runtime', () => {
    const entity = createEntity();
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns null if the binding slot is empty', () => {
    const entity = createEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns the binding slot if set', () => {
    const entity = createEntity();
    const runtime = createEntityRuntime();
    runtime.binding = {};
    entity[EntityRuntimeKey] = runtime;
    expect(getEntityBinding(entity)).toStrictEqual(runtime.binding);
  });
});
