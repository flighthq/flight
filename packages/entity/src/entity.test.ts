import { attachEntityBinding, getEntityBinding } from './binding.ts';
import { cloneEntity } from './clone.ts';
import {
  allocateEntity,
  attachEntityWrapper,
  Entity,
  finishEntity,
  getEntityWrapperAs,
  readEntityRuntime,
  writeEntityRuntime,
} from './entity.ts';
import { createEntityRuntime, hasEntityRuntime } from './runtime.ts';
import type { EntityRaw, EntityRuntime } from './types.ts';
import { EntityRuntimeKey } from './types.ts';

describe('allocateEntity', () => {
  it('returns an object with an undefined runtime', () => {
    const out = allocateEntity();
    expectTypeOf(out).toMatchTypeOf<{ [EntityRuntimeKey]: EntityRuntime | undefined }>();
    expect(out).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(out, EntityRuntimeKey)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(out, EntityRuntimeKey)).toMatchObject({
      enumerable: false,
      value: undefined,
    });
  });
});

describe('attachEntityWrapper', () => {
  it('accepts an idempotent attachment and rejects a second wrapper', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    const wrapper = Entity.from(raw);

    expect(() => attachEntityWrapper(raw, wrapper)).not.toThrow();
    expect(() => attachEntityWrapper(raw, new Entity())).toThrow(TypeError);
  });
});

describe('Entity', () => {
  it('keeps primitive values outside the raw entity contract', () => {
    expectTypeOf<string>().not.toMatchTypeOf<Parameters<typeof Entity.from>[0]>();
    expectTypeOf<keyof EntityRaw>().toEqualTypeOf<never>();
  });

  it('returns one stable wrapper when the same raw object is wrapped twice', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    expect(Entity.from(raw)).toBe(Entity.from(raw));
  });

  it('binds sugar construction back to the raw object', () => {
    const wrapper = new Entity();
    const created = Entity.create();
    expect(Entity.from(wrapper.raw)).toBe(wrapper);
    expect(Entity.from(created.raw)).toBe(created);
  });

  it('keeps wrapper identity separate from replaceable provider bindings', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    const wrapper = Entity.from(raw);
    const firstProvider = { provider: 'first' };
    const secondProvider = { provider: 'second' };

    attachEntityBinding(raw, firstProvider);
    attachEntityBinding(raw, secondProvider);

    expect(Entity.from(raw)).toBe(wrapper);
    expect(getEntityBinding(raw)).toBe(secondProvider);
  });

  it('gives a clone a fresh wrapper identity', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    const wrapper = Entity.from(raw);
    const clone = cloneEntity(raw);

    expect(Entity.from(clone)).not.toBe(wrapper);
  });

  it('attaches runtime metadata to external raws non-enumerably', () => {
    const raw: EntityRaw = {};
    const runtime = createEntityRuntime();
    writeEntityRuntime(raw, runtime);

    expect(hasEntityRuntime(raw)).toBe(true);
    expect(readEntityRuntime(raw)).toBe(runtime);
    expect(Object.getOwnPropertySymbols(raw).every((symbol) => !Object.propertyIsEnumerable.call(raw, symbol))).toBe(
      true,
    );
    expect(hasEntityRuntime({ ...raw })).toBe(false);
  });
});

describe('finishEntity', () => {
  it('returns the same object', () => {
    const out = allocateEntity();
    const entity = finishEntity(out);
    expect(entity).toBe(out);
  });
});

describe('getEntityWrapperAs', () => {
  it('returns the attached wrapper and otherwise returns null', () => {
    const raw = finishEntity(allocateEntity<EntityRaw>());
    expect(getEntityWrapperAs(raw)).toBeNull();

    const wrapper = Entity.from(raw);
    expect(getEntityWrapperAs(raw)).toBe(wrapper);
  });
});

describe('readEntityRuntime', () => {
  it('reads compatibility runtime metadata from an external raw', () => {
    const runtime = createEntityRuntime();
    const raw = { [EntityRuntimeKey]: runtime };

    expect(readEntityRuntime(raw)).toBe(runtime);
  });
});

describe('writeEntityRuntime', () => {
  it('writes runtime metadata without making it enumerable', () => {
    const runtime = createEntityRuntime();
    const raw: EntityRaw = {};

    writeEntityRuntime(raw, runtime);

    expect(readEntityRuntime(raw)).toBe(runtime);
    expect(Object.getOwnPropertyDescriptor(raw, EntityRuntimeKey)?.enumerable).toBe(false);
  });
});
