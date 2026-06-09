import type { EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';
import { createEntityRuntime, getEntityRuntime } from './runtime';

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
    const entity = createEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    const runtime = {} as EntityRuntime;
    entity[EntityRuntimeKey] = runtime;
    expect(getEntityRuntime(entity)).toStrictEqual(runtime);
  });
});
