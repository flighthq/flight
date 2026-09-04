import type { Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { attachEntityBinding } from './binding';
import { cloneEntity, stripEntityRuntime } from './clone';
import { allocateEntity, finishEntity } from './entity';
import { hasEntityRuntime } from './runtime';

function createTestEntity(fields?: Record<string, unknown>): Entity & Record<string, unknown> {
  const out = allocateEntity<Entity>();
  if (fields) Object.assign(out, fields);
  return finishEntity(out) as Entity & Record<string, unknown>;
}

describe('cloneEntity', () => {
  it('returns a new entity with the same public data fields', () => {
    const source = createTestEntity({ x: 1, y: 2 });
    const clone = cloneEntity(source);
    expect(clone.x).toBe(1);
    expect(clone.y).toBe(2);
  });

  it('resets the runtime slot to undefined on the clone', () => {
    const source = createTestEntity();
    attachEntityBinding(source, {});
    expect(hasEntityRuntime(source)).toBe(true);
    const clone = cloneEntity(source);
    expect(hasEntityRuntime(clone)).toBe(false);
  });

  it('does not share the runtime between source and clone', () => {
    const source = createTestEntity();
    const clone = cloneEntity(source);
    expect(clone[EntityRuntimeKey]).toBeUndefined();
    expect(clone).not.toBe(source);
  });

  it('returns a new object reference', () => {
    const source = createTestEntity();
    const clone = cloneEntity(source);
    expect(clone).not.toBe(source);
  });

  it('clone of a bound entity yields an unbound clone', () => {
    const source = createTestEntity({ name: 'test' });
    attachEntityBinding(source, { hostRef: 42 });
    const clone = cloneEntity(source);
    expect(hasEntityRuntime(clone)).toBe(false);
    expect(clone.name).toBe('test');
  });
});

describe('stripEntityRuntime', () => {
  it('removes the EntityRuntimeKey slot', () => {
    const entity = createTestEntity({ x: 10 });
    const stripped = stripEntityRuntime(entity);
    expect((stripped as Record<PropertyKey, unknown>)[EntityRuntimeKey]).toBeUndefined();
  });

  it('retains the public data fields', () => {
    const entity = createTestEntity({ x: 10, y: 20 });
    const stripped = stripEntityRuntime(entity);
    expect(stripped.x).toBe(10);
    expect(stripped.y).toBe(20);
  });

  it('does not mutate the source entity', () => {
    const entity = createTestEntity({ x: 10 });
    stripEntityRuntime(entity);
    expect(entity[EntityRuntimeKey]).toBeUndefined();
  });

  it('strips bound entity — binding is not in the output', () => {
    const entity = createTestEntity({ label: 'hello' });
    attachEntityBinding(entity, { nativeRef: true });
    const stripped = stripEntityRuntime(entity);
    expect((stripped as Record<PropertyKey, unknown>)[EntityRuntimeKey]).toBeUndefined();
    expect(stripped.label).toBe('hello');
  });

  it('round-trips: stripEntityRuntime then allocateEntity yields a valid unbound entity', () => {
    const original = createTestEntity({ value: 99 });
    attachEntityBinding(original, {});
    const stripped = stripEntityRuntime(original);
    const out = allocateEntity<Entity>();
    Object.assign(out, stripped);
    const restored = finishEntity(out);
    expect((restored as unknown as Record<string, unknown>).value).toBe(99);
    expect(hasEntityRuntime(restored)).toBe(false);
  });
});
