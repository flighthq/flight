import { Entity } from '@flighthq/entity/contract';

import type { HslColorRaw, HsvColorRaw, LinearColorRaw } from './contract.ts';
import {
  allocateHslColor,
  allocateHsvColor,
  allocateLinearColor,
  lerpLinearColor,
  packLinearToColor,
  rgbToHsl,
  rgbToHsv,
  unpackColorToLinear,
} from './contract.ts';
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
type _HslFromRawIsNarrowed = Assert<IsExact<Parameters<typeof HslColor.from>[0], HslColorRaw>>;
type _HsvFromRawIsNarrowed = Assert<IsExact<Parameters<typeof HsvColor.from>[0], HsvColorRaw>>;
type _LinearFromRawIsNarrowed = Assert<IsExact<Parameters<typeof LinearColor.from>[0], LinearColorRaw>>;
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

  it('proxies every concrete field in both directions', () => {
    const hslRaw = allocateHslColor();
    const hsvRaw = allocateHsvColor();
    const linearRaw = allocateLinearColor();
    const hslWrapped = new HslColor(hslRaw);
    const hsvWrapped = new HsvColor(hsvRaw);
    const linearWrapped = new LinearColor(linearRaw);

    hslWrapped.h = 10;
    hslWrapped.s = 0.2;
    hslWrapped.l = 0.3;
    hsvWrapped.h = 40;
    hsvWrapped.s = 0.5;
    hsvWrapped.v = 0.6;
    linearWrapped.r = 0.1;
    linearWrapped.g = 0.2;
    linearWrapped.b = 0.3;
    linearWrapped.a = 0.4;

    expect(hslRaw).toMatchObject({ h: 10, l: 0.3, s: 0.2 });
    expect(hsvRaw).toMatchObject({ h: 40, s: 0.5, v: 0.6 });
    expect(linearRaw).toMatchObject({ a: 0.4, b: 0.3, g: 0.2, r: 0.1 });

    Object.assign(hslRaw, { h: 70, l: 0.8, s: 0.9 });
    Object.assign(hsvRaw, { h: 100, s: 0.7, v: 0.6 });
    Object.assign(linearRaw, { a: 0.5, b: 0.6, g: 0.7, r: 0.8 });

    expect({ h: hslWrapped.h, l: hslWrapped.l, s: hslWrapped.s }).toEqual({ h: 70, l: 0.8, s: 0.9 });
    expect({ h: hsvWrapped.h, s: hsvWrapped.s, v: hsvWrapped.v }).toEqual({ h: 100, s: 0.7, v: 0.6 });
    expect({ a: linearWrapped.a, b: linearWrapped.b, g: linearWrapped.g, r: linearWrapped.r }).toEqual({
      a: 0.5,
      b: 0.6,
      g: 0.7,
      r: 0.8,
    });
  });

  it('matches all five Rust companion sugar methods to their free functions', () => {
    const hslWrapped = new HslColor();
    const hslExpected = allocateHslColor();
    hslWrapped.rgbToHsl(0xff8040ff);
    rgbToHsl(hslExpected, 0xff8040ff);
    expect(hslWrapped.raw).toMatchObject(hslExpected);

    const hsvWrapped = new HsvColor();
    const hsvExpected = allocateHsvColor();
    hsvWrapped.rgbToHsv(0x40ff80ff);
    rgbToHsv(hsvExpected, 0x40ff80ff);
    expect(hsvWrapped.raw).toMatchObject(hsvExpected);

    const linearWrapped = new LinearColor();
    const linearExpected = allocateLinearColor();
    linearWrapped.unpackColor(0x804020c0);
    unpackColorToLinear(linearExpected, 0x804020c0);
    expect(linearWrapped.raw).toMatchObject(linearExpected);
    expect(linearWrapped.packToColor()).toBe(packLinearToColor(linearWrapped.raw));

    const start = new LinearColor();
    Object.assign(start.raw, { a: 0.1, b: 0.2, g: 0.3, r: 0.4 });
    const end = new LinearColor();
    Object.assign(end.raw, { a: 0.9, b: 0.8, g: 0.7, r: 0.6 });
    const lerpedExpected = allocateLinearColor();
    lerpLinearColor(lerpedExpected, start.raw, end.raw, 0.25);
    linearWrapped.lerp(start, end, 0.25);
    expect(linearWrapped.raw).toMatchObject(lerpedExpected);
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

    expect(() => HsvColor.from(hslWrapped.raw as unknown as HsvColorRaw)).toThrow(TypeError);
    expect(() => LinearColor.from(hsvWrapped.raw as unknown as LinearColorRaw)).toThrow(TypeError);
    expect(() => HslColor.from(linearWrapped.raw as unknown as HslColorRaw)).toThrow(TypeError);
  });
});
