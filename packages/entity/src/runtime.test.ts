import type { Entity } from '@flighthq/types/contract';
import type { EntityRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { attachEntityBinding } from './binding';
import { allocateEntity, finishEntity } from './entity';
import { createEntityRuntime, getEntityRuntime, hasEntityRuntime } from './runtime';

function createTestEntity(): Entity {
  return finishEntity(allocateEntity<Entity>());
}

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
    const entity = createTestEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    const runtime = {} as EntityRuntime;
    entity[EntityRuntimeKey] = runtime;
    expect(getEntityRuntime(entity)).toStrictEqual(runtime);
  });
});

describe('hasEntityRuntime', () => {
  it('returns false for a fresh entity', () => {
    const entity = createTestEntity();
    expect(hasEntityRuntime(entity)).toBe(false);
  });

  it('returns true after a binding is attached', () => {
    const entity = createTestEntity();
    attachEntityBinding(entity, {});
    expect(hasEntityRuntime(entity)).toBe(true);
  });
});
