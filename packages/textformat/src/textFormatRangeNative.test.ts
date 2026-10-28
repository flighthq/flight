import { Entity } from '@flighthq/entity/contract';

import type { TextFormat } from './textFormat.ts';
import { TextFormatRange } from './textFormatRange.ts';
import { createTextFormatRange } from './textFormatRangeRaw.ts';
import type { TextFormatRangeRaw } from './textFormatRangeRaw.ts';

describe('TextFormatRange', () => {
  it('provides class-correct constructor and create defaults compatible with Entity', () => {
    const constructorRange = new TextFormatRange();
    const createdRange = TextFormatRange.create();
    const entityClass: typeof Entity = TextFormatRange;
    const baseCreated = entityClass.create();

    expect(constructorRange).toBeInstanceOf(TextFormatRange);
    expect(constructorRange.raw).toMatchObject({ end: 0, format: {}, start: 0 });
    expect(createdRange).toBeInstanceOf(TextFormatRange);
    expect(createdRange.raw).toMatchObject({ end: 0, format: {}, start: 0 });
    expect(baseCreated).toBeInstanceOf(TextFormatRange);
    expectTypeOf(constructorRange).toEqualTypeOf<TextFormatRange>();
    expectTypeOf(createdRange).toEqualTypeOf<TextFormatRange>();
    expectTypeOf(baseCreated).toEqualTypeOf<Entity>();
  });

  it('creates a typed range from explicit fields', () => {
    const format = { italic: true };
    const range = TextFormatRange.create(format, 2, 5);

    expect(range).toBeInstanceOf(TextFormatRange);
    expect(range.raw).toMatchObject({ end: 5, format, start: 2 });
    expect(TextFormatRange.from(range.raw)).toBe(range);
    expectTypeOf(range).toEqualTypeOf<TextFormatRange>();
    expectTypeOf(range.raw).toEqualTypeOf<TextFormatRangeRaw>();
  });

  it('constructs the same raw fields as the type-owned factory', () => {
    const format = { bold: true, size: 16 };
    const range = new TextFormatRange(format, 1, 3);

    expect(range.raw).toMatchObject({ end: 3, format, start: 1 });
    expect(TextFormatRange.from(range.raw)).toBe(range);
  });

  it('returns one stable typed wrapper for repeated typed conversions', () => {
    const raw = createTextFormatRange({}, 0, 1);
    const wrapper = TextFormatRange.from(raw);

    expect(TextFormatRange.from(raw)).toBe(wrapper);
  });

  it('narrows the public raw value to the TextFormatRange fields', () => {
    const wrapper = TextFormatRange.from(createTextFormatRange({}, 0, 1));

    expectTypeOf(wrapper.raw.format).toEqualTypeOf<TextFormat>();
    expectTypeOf(wrapper.raw.start).toEqualTypeOf<number>();
    expectTypeOf(wrapper.raw.end).toEqualTypeOf<number>();
    expectTypeOf(wrapper.format).toEqualTypeOf<TextFormat>();
    expectTypeOf(wrapper.start).toEqualTypeOf<number>();
    expectTypeOf(wrapper.end).toEqualTypeOf<number>();
  });

  it('forwards direct field reads and writes to the narrowed raw value', () => {
    const raw = createTextFormatRange({ italic: true }, 2, 5);
    const wrapper = TextFormatRange.from(raw);

    expect(wrapper.format).toBe(raw.format);
    expect(wrapper.start).toBe(2);
    expect(wrapper.end).toBe(5);

    const replacement = { bold: true };
    wrapper.format = replacement;
    wrapper.start = 7;
    wrapper.end = 11;

    expect(raw.format).toBe(replacement);
    expect(raw.start).toBe(7);
    expect(raw.end).toBe(11);

    raw.start = 13;
    expect(wrapper.start).toBe(13);
  });

  it('preserves a typed-first wrapper through the generic conversion', () => {
    const raw = createTextFormatRange({}, 0, 1);
    const wrapper = TextFormatRange.from(raw);

    expect(Entity.from(raw)).toBe(wrapper);
  });

  it('rejects a generic-first collision instead of blind-casting the generic wrapper', () => {
    const raw = createTextFormatRange({}, 0, 1);
    const generic = Entity.from(raw);

    expect(() => TextFormatRange.from(raw)).toThrow(
      new TypeError('TextFormatRangeRaw is already attached to an incompatible OOP wrapper'),
    );
    expect(Entity.from(raw)).toBe(generic);
  });

  it('rejects a raw claimed by a different typed wrapper without replacing its identity', () => {
    const raw = createTextFormatRange({}, 0, 1);
    const other = new OtherEntity(raw);

    expect(() => TextFormatRange.from(raw)).toThrow(TypeError);
    expect(Entity.from(raw)).toBe(other);
  });
});

class OtherEntity extends Entity {}
