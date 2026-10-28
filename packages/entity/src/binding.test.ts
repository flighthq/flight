import {
  attachEntityBinding,
  attachEntityWrapper,
  detachEntityBinding,
  getEntityBinding,
  getEntityBindingAs,
  getEntityWrapperAs,
  hasEntityBinding,
} from './binding.ts';
import { allocateEntity, finishEntity } from './entity.ts';
import { createEntityRuntime, getEntityRuntime } from './runtime.ts';
import type { Entity, EntityRaw } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

function createTestEntity(): Entity {
  return finishEntity(allocateEntity<Entity>());
}

describe('attachEntityBinding', () => {
  it('creates a runtime object if none is present', () => {
    const entity = createTestEntity();
    expect(getEntityRuntime(entity)).toBeUndefined();
    attachEntityBinding(entity, {});
    expect(getEntityRuntime(entity)).not.toBeUndefined();
  });

  it('assigns to the binding slot', () => {
    const entity = createTestEntity();
    const binding = {};
    attachEntityBinding(entity, binding);
    expect(getEntityRuntime(entity).binding).toStrictEqual(binding);
  });

  it('preserves an existing runtime while assigning its binding', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    const binding = {};
    entity[EntityRuntimeKey] = runtime;

    attachEntityBinding(entity, binding);

    expect(getEntityRuntime(entity)).toBe(runtime);
    expect(runtime.binding).toBe(binding);
  });
});

describe('detachEntityBinding', () => {
  it('clears the binding while preserving the runtime', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    runtime.binding = {};
    entity[EntityRuntimeKey] = runtime;

    detachEntityBinding(entity);

    expect(entity[EntityRuntimeKey]).toBe(runtime);
    expect(runtime.binding).toBeNull();
  });

  it('does not allocate a runtime when no binding exists', () => {
    const entity = createTestEntity();

    detachEntityBinding(entity);

    expect(entity[EntityRuntimeKey]).toBeUndefined();
  });
});

describe('getEntityBinding', () => {
  it('returns null if the entity has no runtime', () => {
    const entity = createTestEntity();
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns null if the binding slot is empty', () => {
    const entity = createTestEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();
    expect(getEntityBinding(entity)).toBeNull();
  });

  it('returns the binding slot if set', () => {
    const entity = createTestEntity();
    const runtime = createEntityRuntime();
    runtime.binding = {};
    entity[EntityRuntimeKey] = runtime;
    expect(getEntityBinding(entity)).toStrictEqual(runtime.binding);
  });

  it('accepts a readonly entity', () => {
    const entity: Readonly<Entity> = createTestEntity();
    expect(getEntityBinding(entity)).toBeNull();
  });
});

describe('getEntityBindingAs', () => {
  it('returns the binding with the caller-owned type', () => {
    const entity = createTestEntity();
    const binding = { name: 'wrapper' };
    attachEntityBinding(entity, binding);

    const result = getEntityBindingAs<{ name: string }>(entity);

    expectTypeOf(result).toEqualTypeOf<{ name: string } | null>();
    expect(result).toBe(binding);
  });

  it('returns null if no binding exists', () => {
    const entity: Readonly<Entity> = createTestEntity();
    expect(getEntityBindingAs<{ name: string }>(entity)).toBeNull();
  });
});

describe('getEntityWrapperAs', () => {
  it('returns one stable OOP wrapper when the same raw object is wrapped twice', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());

    class Wrapper {
      private constructor(readonly raw: EntityRaw) {
        attachEntityWrapper(raw, this);
      }

      static from(raw: EntityRaw): Wrapper {
        return getEntityWrapperAs<Wrapper>(raw) ?? new Wrapper(raw);
      }
    }

    expect(Wrapper.from(raw)).toBe(Wrapper.from(raw));
  });

  it('binds sugar construction back to the raw object', () => {
    class Wrapper {
      private constructor(readonly raw: EntityRaw) {
        attachEntityWrapper(raw, this);
      }

      static create(): Wrapper {
        return new Wrapper(finishEntity(allocateEntity<EntityRaw>()));
      }
    }

    const wrapper = Wrapper.create();
    expect(getEntityWrapperAs<Wrapper>(wrapper.raw)).toBe(wrapper);
  });

  it('preserves wrapper identity when provider bindings are replaced', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    const wrapper = { raw };
    const firstProvider = { provider: 'first' };
    const secondProvider = { provider: 'second' };

    attachEntityWrapper(raw, wrapper);
    attachEntityBinding(raw, firstProvider);
    attachEntityBinding(raw, secondProvider);

    expect(getEntityWrapperAs(raw)).toBe(wrapper);
    expect(getEntityBinding(raw)).toBe(secondProvider);
  });

  it('rejects replacing an existing OOP wrapper', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    attachEntityWrapper(raw, {});

    expect(() => attachEntityWrapper(raw, {})).toThrow(
      'An EntityRaw object cannot be attached to more than one OOP wrapper',
    );
  });
});

describe('hasEntityBinding', () => {
  it('returns false if the entity has no runtime', () => {
    const entity: Readonly<Entity> = createTestEntity();
    expect(hasEntityBinding(entity)).toBe(false);
  });

  it('returns false if the binding slot is empty', () => {
    const entity = createTestEntity();
    entity[EntityRuntimeKey] = createEntityRuntime();
    expect(hasEntityBinding(entity)).toBe(false);
  });

  it('returns true if a binding exists', () => {
    const entity = createTestEntity();
    attachEntityBinding(entity, {});
    expect(hasEntityBinding(entity)).toBe(true);
  });
});
