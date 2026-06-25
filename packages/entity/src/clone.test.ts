import { EntityRuntimeKey } from '@flighthq/types';

import { attachEntityBinding } from './binding';
import { cloneEntity, stripEntityRuntime } from './clone';
import { createEntity } from './entity';
import { hasEntityRuntime } from './runtime';

describe('cloneEntity', () => {
  it('returns a new entity with the same public data fields', () => {
    const source = createEntity({ x: 1, y: 2 });
    const clone = cloneEntity(source);
    expect(clone.x).toBe(1);
    expect(clone.y).toBe(2);
  });

  it('resets the runtime slot to undefined on the clone', () => {
    const source = createEntity();
    attachEntityBinding(source, {});
    expect(hasEntityRuntime(source)).toBe(true);
    const clone = cloneEntity(source);
    expect(hasEntityRuntime(clone)).toBe(false);
  });

  it('does not share the runtime between source and clone', () => {
    const source = createEntity();
    const clone = cloneEntity(source);
    expect(clone[EntityRuntimeKey]).toBeUndefined();
    expect(clone).not.toBe(source);
  });

  it('returns a new object reference', () => {
    const source = createEntity();
    const clone = cloneEntity(source);
    expect(clone).not.toBe(source);
  });

  it('clone of a bound entity yields an unbound clone', () => {
    const source = createEntity({ name: 'test' });
    attachEntityBinding(source, { hostRef: 42 });
    const clone = cloneEntity(source);
    expect(hasEntityRuntime(clone)).toBe(false);
    expect(clone.name).toBe('test');
  });
});

describe('stripEntityRuntime', () => {
  it('removes the EntityRuntimeKey slot', () => {
    const entity = createEntity({ x: 10 });
    const stripped = stripEntityRuntime(entity);
    expect((stripped as Record<PropertyKey, unknown>)[EntityRuntimeKey]).toBeUndefined();
  });

  it('retains the public data fields', () => {
    const entity = createEntity({ x: 10, y: 20 });
    const stripped = stripEntityRuntime(entity);
    expect(stripped.x).toBe(10);
    expect(stripped.y).toBe(20);
  });

  it('does not mutate the source entity', () => {
    const entity = createEntity({ x: 10 });
    stripEntityRuntime(entity);
    expect(entity[EntityRuntimeKey]).toBeUndefined();
  });

  it('strips bound entity — binding is not in the output', () => {
    const entity = createEntity({ label: 'hello' });
    attachEntityBinding(entity, { nativeRef: true });
    const stripped = stripEntityRuntime(entity);
    expect((stripped as Record<PropertyKey, unknown>)[EntityRuntimeKey]).toBeUndefined();
    expect(stripped.label).toBe('hello');
  });

  it('round-trips: stripEntityRuntime then createEntity yields a valid unbound entity', () => {
    const original = createEntity({ value: 99 });
    attachEntityBinding(original, {});
    const stripped = stripEntityRuntime(original);
    const restored = createEntity(stripped);
    expect(restored.value).toBe(99);
    expect(hasEntityRuntime(restored)).toBe(false);
  });
});
