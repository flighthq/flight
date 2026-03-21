import { type Runtime, RuntimeKey } from '@flighthq/types';

import { attachAPI, getAPI } from './api';
import { createEntity } from './entity';
import { createRuntime, getRuntime } from './runtime';

describe('attachAPI', () => {
  it('creates a runtime object if none is present', () => {
    const entity = createEntity();
    expect(getRuntime(entity)).toBeUndefined();
    attachAPI(entity, {});
    expect(getRuntime(entity)).not.toBeUndefined();
  });

  it('assigns to the api slot', () => {
    const entity = createEntity();
    const api = {};
    attachAPI(entity, api);
    expect(getRuntime(entity).api).toStrictEqual(api);
  });
});

describe('getAPI', () => {
  it('returns null if the entity has no runtime', () => {
    const entity = createEntity();
    expect(getAPI(entity)).toBeNull();
  });

  it('returns null if the api slot is empty', () => {
    const entity = createEntity();
    entity[RuntimeKey] = createRuntime();
    expect(getAPI(entity)).toBeNull();
  });

  it('returns the api slot if set', () => {
    const entity = createEntity();
    const runtime = createRuntime();
    runtime.api = {};
    entity[RuntimeKey] = runtime;
    expect(getAPI(entity)).toStrictEqual(runtime.api);
  });
});
