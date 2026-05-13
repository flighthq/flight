import { RuntimeKey } from '@flighthq/types';

import { attachBinding, getBinding } from './binding';
import { createEntity } from './entity';
import { createRuntime, getRuntime } from './runtime';

describe('attachBinding', () => {
  it('creates a runtime object if none is present', () => {
    const entity = createEntity();
    expect(getRuntime(entity)).toBeUndefined();
    attachBinding(entity, {});
    expect(getRuntime(entity)).not.toBeUndefined();
  });

  it('assigns to the binding slot', () => {
    const entity = createEntity();
    const binding = {};
    attachBinding(entity, binding);
    expect(getRuntime(entity).binding).toStrictEqual(binding);
  });
});

describe('getBinding', () => {
  it('returns null if the entity has no runtime', () => {
    const entity = createEntity();
    expect(getBinding(entity)).toBeNull();
  });

  it('returns null if the binding slot is empty', () => {
    const entity = createEntity();
    entity[RuntimeKey] = createRuntime();
    expect(getBinding(entity)).toBeNull();
  });

  it('returns the binding slot if set', () => {
    const entity = createEntity();
    const runtime = createRuntime();
    runtime.binding = {};
    entity[RuntimeKey] = runtime;
    expect(getBinding(entity)).toStrictEqual(runtime.binding);
  });
});
