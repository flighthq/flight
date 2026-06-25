import type { EntityRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import { attachEntityBinding } from './binding';
import { createEntity } from './entity';
import { createEntityRuntime, getEntityRuntime, hasEntityRuntime } from './runtime';

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

describe('hasEntityRuntime', () => {
  it('returns false for a fresh entity', () => {
    const entity = createEntity();
    expect(hasEntityRuntime(entity)).toBe(false);
  });

  it('returns true after a binding is attached', () => {
    const entity = createEntity();
    attachEntityBinding(entity, {});
    expect(hasEntityRuntime(entity)).toBe(true);
  });
});
