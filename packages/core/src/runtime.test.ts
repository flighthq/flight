import type { Runtime } from '@flighthq/types';
import { RuntimeKey } from '@flighthq/types';

import { createEntity } from './entity';
import { createRuntime, getRuntime } from './runtime';

describe('createRuntime', () => {
  it('returns an object', () => {
    const runtime = createRuntime();
    expect(runtime).not.toBeNull();
  });

  it('has a null api slot', () => {
    const runtime = createRuntime();
    expect(runtime.api).toBeNull();
  });
});

describe('getRuntime', () => {
  it('returns the runtime object', () => {
    const entity = createEntity();
    expect(getRuntime(entity)).toBeUndefined();
    const runtime = {} as Runtime;
    entity[RuntimeKey] = runtime;
    expect(getRuntime(entity)).toStrictEqual(runtime);
  });
});
