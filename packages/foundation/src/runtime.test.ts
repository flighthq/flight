import type { EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';
import { createRuntime, getRuntime } from './runtime';

describe('createRuntime', () => {
  it('returns an object', () => {
    const runtime = createRuntime();
    expect(runtime).not.toBeNull();
  });

  it('has a null api slot', () => {
    const runtime = createRuntime();
    expect(runtime.binding).toBeNull();
  });
});

describe('getRuntime', () => {
  it('returns the runtime object', () => {
    const entity = createEntity();
    expect(getRuntime(entity)).toBeUndefined();
    const runtime = {} as EntityRuntime;
    entity[EntityRuntimeKey] = runtime;
    expect(getRuntime(entity)).toStrictEqual(runtime);
  });
});
