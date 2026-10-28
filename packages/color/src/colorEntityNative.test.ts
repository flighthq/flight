import { Entity } from '@flighthq/entity/contract';

import type { HslColorRaw, HsvColorRaw, LinearColorRaw } from './contract.ts';
import { allocateHslColor, allocateHsvColor, allocateLinearColor } from './contract.ts';
import { HslColor, HsvColor, LinearColor } from './index.ts';

type IsExact<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

const hsl: HslColor = new HslColor();
const hsv: HsvColor = new HsvColor();
const linear: LinearColor = new LinearColor();

type _HslRawIsNarrowed = Assert<IsExact<typeof hsl.raw, HslColorRaw>>;
type _HsvRawIsNarrowed = Assert<IsExact<typeof hsv.raw, HsvColorRaw>>;
type _LinearRawIsNarrowed = Assert<IsExact<typeof linear.raw, LinearColorRaw>>;
type _HslStaticIsCompatible = Assert<typeof HslColor extends typeof Entity ? true : false>;
type _HsvStaticIsCompatible = Assert<typeof HsvColor extends typeof Entity ? true : false>;
type _LinearStaticIsCompatible = Assert<typeof LinearColor extends typeof Entity ? true : false>;

describe('Color Entity wrappers', () => {
  it('creates each concrete wrapper class with a narrowed Raw value', () => {
    const hslRaw = allocateHslColor();
    const hsvRaw = allocateHsvColor();
    const linearRaw = allocateLinearColor();

    const hslConstructed: HslColor = new HslColor(hslRaw);
    const hsvConstructed: HsvColor = new HsvColor(hsvRaw);
    const linearConstructed: LinearColor = new LinearColor(linearRaw);

    expect(hslConstructed).toBeInstanceOf(HslColor);
    expect(hsvConstructed).toBeInstanceOf(HsvColor);
    expect(linearConstructed).toBeInstanceOf(LinearColor);
    expect(hslConstructed.raw).toBe(hslRaw);
    expect(hsvConstructed.raw).toBe(hsvRaw);
    expect(linearConstructed.raw).toBe(linearRaw);
    expect(HslColor.create()).toBeInstanceOf(HslColor);
    expect(HsvColor.create()).toBeInstanceOf(HsvColor);
    expect(LinearColor.create()).toBeInstanceOf(LinearColor);
  });

  it('preserves typed-first wrapper identity through concrete and generic lookup', () => {
    expect(HslColor.from(hsl.raw)).toBe(hsl);
    expect(HsvColor.from(hsv.raw)).toBe(hsv);
    expect(LinearColor.from(linear.raw)).toBe(linear);
    expect(Entity.from(hsl.raw)).toBe(hsl);
    expect(Entity.from(hsv.raw)).toBe(hsv);
    expect(Entity.from(linear.raw)).toBe(linear);
  });

  it('rejects generic-first wrapper collisions with a clear TypeError', () => {
    const hslRaw = allocateHslColor();
    const hsvRaw = allocateHsvColor();
    const linearRaw = allocateLinearColor();
    Entity.from(hslRaw);
    Entity.from(hsvRaw);
    Entity.from(linearRaw);

    expect(() => HslColor.from(hslRaw)).toThrow(TypeError);
    expect(() => HslColor.from(hslRaw)).toThrow(/HslColor.*different wrapper/);
    expect(() => HsvColor.from(hsvRaw)).toThrow(TypeError);
    expect(() => HsvColor.from(hsvRaw)).toThrow(/HsvColor.*different wrapper/);
    expect(() => LinearColor.from(linearRaw)).toThrow(TypeError);
    expect(() => LinearColor.from(linearRaw)).toThrow(/LinearColor.*different wrapper/);
  });

  it('rejects an existing wrapper of the wrong concrete Color class', () => {
    const hslWrapped = new HslColor();
    const hsvWrapped = new HsvColor();
    const linearWrapped = new LinearColor();

    expect(() => HsvColor.from(hslWrapped.raw)).toThrow(TypeError);
    expect(() => LinearColor.from(hsvWrapped.raw)).toThrow(TypeError);
    expect(() => HslColor.from(linearWrapped.raw)).toThrow(TypeError);
  });
});
