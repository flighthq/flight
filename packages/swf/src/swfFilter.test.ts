import type {
  Adjustment,
  BevelEffect,
  BlurEffect,
  ColorMatrixAdjustment,
  ConvolutionEffect,
  DropShadowEffect,
  GradientGlowEffect,
  InnerGlowEffect,
  InnerShadowEffect,
  OuterGlowEffect,
  RenderEffect,
} from '@flighthq/types/contract';

import { readSwfFilterList, setSwfFilterListGuard } from './swfFilter';
import { SwfReader } from './swfReader';

describe('readSwfFilterList', () => {
  it('reads a drop shadow into a drop-shadow effect with degrees, packed colour and separate alpha', () => {
    const { effects } = read(
      joinBytes(
        new Uint8Array([1, 0]),
        rgba(0x11, 0x22, 0x33, 0x80),
        fixed(4),
        fixed(6),
        fixed(Math.PI / 2),
        fixed(10),
        fixed8(1.5),
        new Uint8Array([3]),
      ),
    );

    const shadow = effects[0] as DropShadowEffect;
    expect(shadow.kind).toBe('DropShadowEffect');
    expect(shadow.color).toBe(0x112233);
    expect(shadow.alpha).toBeCloseTo(0x80 / 0xff, 10);
    // A 16.16 fixed-point right angle is only accurate to about a thousandth of a degree.
    expect(shadow.angle).toBeCloseTo(90, 3);
    expect(shadow).toMatchObject({ blurX: 4, blurY: 6, distance: 10, quality: 3, strength: 1.5 });
  });

  it('keeps an inner drop shadow directional', () => {
    const { effects } = read(
      joinBytes(
        new Uint8Array([1, 0]),
        rgba(0, 0, 0, 0xff),
        fixed(2),
        fixed(2),
        fixed(Math.PI / 2),
        fixed(8),
        fixed8(1),
        new Uint8Array([0x80 | 2]),
      ),
    );

    const shadow = effects[0] as InnerShadowEffect;
    expect(shadow.kind).toBe('InnerShadowEffect');
    expect(shadow.angle).toBeCloseTo(90, 3);
    expect(shadow).toMatchObject({ blurX: 2, blurY: 2, distance: 8, quality: 2 });
  });

  it('reads a blur', () => {
    const { effects } = read(joinBytes(new Uint8Array([1, 1]), fixed(12), fixed(3), new Uint8Array([0x60])));

    expect((effects[0] as BlurEffect).kind).toBe('BlurEffect');
    expect(effects[0]).toMatchObject({ blurX: 12, blurY: 3 });
  });

  it('splits a glow by its inner flag', () => {
    const outer = read(
      joinBytes(new Uint8Array([1, 2]), rgba(0xff, 0, 0, 0xff), fixed(5), fixed(5), fixed8(2), new Uint8Array([1])),
    );
    const inner = read(
      joinBytes(new Uint8Array([1, 2]), rgba(0xff, 0, 0, 0xff), fixed(5), fixed(5), fixed8(2), new Uint8Array([0x81])),
    );

    expect((outer.effects[0] as OuterGlowEffect).kind).toBe('OuterGlowEffect');
    expect(outer.effects[0]).toMatchObject({ alpha: 1, color: 0xff0000, strength: 2 });
    expect((inner.effects[0] as InnerGlowEffect).kind).toBe('InnerGlowEffect');
  });

  it('names a bevel by the combination of its two placement flags', () => {
    const bevel = (flags: number): BevelEffect =>
      read(
        joinBytes(
          new Uint8Array([1, 3]),
          rgba(0x10, 0x10, 0x10, 0xff),
          rgba(0xf0, 0xf0, 0xf0, 0x40),
          fixed(3),
          fixed(3),
          fixed(0),
          fixed(4),
          fixed8(1),
          new Uint8Array([flags]),
        ),
      ).effects[0] as BevelEffect;

    expect(bevel(0)).toMatchObject({ bevelType: 'outer', shadowColor: 0x101010, highlightColor: 0xf0f0f0 });
    expect(bevel(0x10).bevelType).toBe('full');
    expect(bevel(0x80).bevelType).toBe('inner');
    expect(bevel(0).highlightAlpha).toBeCloseTo(0x40 / 0xff, 10);
  });

  it('reads a gradient glow ramp, whose ratios follow the whole colour table', () => {
    const { effects } = read(
      joinBytes(
        new Uint8Array([1, 4, 2]),
        rgba(0xff, 0, 0, 0),
        rgba(0, 0, 0xff, 0xff),
        new Uint8Array([0, 255]),
        fixed(6),
        fixed(6),
        fixed(0),
        fixed(0),
        fixed8(1),
        new Uint8Array([0]),
      ),
    );

    const glow = effects[0] as GradientGlowEffect;
    expect(glow.kind).toBe('GradientGlowEffect');
    expect(glow.colors).toEqual([0xff0000, 0x0000ff]);
    expect(glow.alphas).toEqual([0, 1]);
    expect(glow.ratios).toEqual([0, 255]);
  });

  it('reads a convolution kernel with its flags', () => {
    const { effects } = read(
      joinBytes(
        new Uint8Array([1, 5, 2, 1]),
        float32(4),
        float32(2),
        float32(1),
        float32(3),
        rgba(0, 0, 0, 0xff),
        new Uint8Array([0x03]),
      ),
    );

    const convolution = effects[0] as ConvolutionEffect;
    expect(convolution.kind).toBe('ConvolutionEffect');
    expect(convolution).toMatchObject({
      bias: 2,
      clamp: true,
      divisor: 4,
      matrix: [1, 3],
      matrixX: 2,
      matrixY: 1,
      preserveAlpha: true,
    });
  });

  it('reads a colour matrix onto the adjustment tier, normalizing only its bias column', () => {
    const cells: Uint8Array[] = [];
    for (let index = 0; index < 20; index++) cells.push(float32(index % 5 === 4 ? 255 : 1));
    const { adjustments, effects } = read(joinBytes(new Uint8Array([1, 6]), ...cells));

    const matrix = (adjustments[0] as ColorMatrixAdjustment).colorMatrix;
    expect(effects).toHaveLength(0);
    expect(adjustments[0].kind).toBe('ColorMatrixAdjustment');
    expect(matrix[0]).toBe(1);
    expect(matrix[4]).toBe(1);
    expect(matrix[9]).toBe(1);
  });

  it('stops at a filter it does not recognize rather than misreading the rest of the list', () => {
    const { effects } = read(
      joinBytes(
        new Uint8Array([2, 1]),
        fixed(1),
        fixed(1),
        new Uint8Array([0]),
        new Uint8Array([9]),
        fixed(1),
        fixed(1),
      ),
    );

    expect(effects).toHaveLength(1);
    expect(effects[0].kind).toBe('BlurEffect');
  });

  it('reads nothing from an empty list', () => {
    const { adjustments, complete, effects } = read(new Uint8Array([0]));

    expect(complete).toBe(true);
    expect(effects).toHaveLength(0);
    expect(adjustments).toHaveLength(0);
  });

  it('stops on a truncated filter body rather than inventing values', () => {
    const { complete, effects } = read(joinBytes(new Uint8Array([1, 0]), rgba(1, 2, 3, 4), fixed(1)));

    expect(complete).toBe(false);
    expect(effects).toHaveLength(0);
  });
});

describe('setSwfFilterListGuard', () => {
  it('stops and reports an unknown filter before its payload can be mistaken for another field', () => {
    const seen: number[] = [];
    setSwfFilterListGuard((filterId, filterIndex) => seen.push(filterId, filterIndex));
    try {
      const { complete, effects } = read(
        joinBytes(new Uint8Array([2, 1]), fixed(4), fixed(2), new Uint8Array([0]), new Uint8Array([0xfe, 13])),
      );

      expect(complete).toBe(false);
      expect(effects).toHaveLength(1);
      expect(effects[0].kind).toBe('BlurEffect');
      expect(seen).toEqual([0xfe, 1]);
    } finally {
      setSwfFilterListGuard(null);
    }
  });
});

function read(bytes: Uint8Array): { adjustments: Adjustment[]; complete: boolean; effects: RenderEffect[] } {
  const adjustments: Adjustment[] = [];
  const effects: RenderEffect[] = [];
  const complete = readSwfFilterList(new SwfReader(bytes, 0, bytes.length), effects, adjustments);
  return { adjustments, complete, effects };
}

function fixed(value: number): Uint8Array {
  return uint32(Math.round(value * 0x10000));
}

function fixed8(value: number): Uint8Array {
  const raw = Math.round(value * 0x100);
  return new Uint8Array([raw & 0xff, (raw >> 8) & 0xff]);
}

function float32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return bytes;
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function rgba(red: number, green: number, blue: number, alpha: number): Uint8Array {
  return new Uint8Array([red, green, blue, alpha]);
}

function uint32(value: number): Uint8Array {
  const raw = value < 0 ? value + 0x100000000 : value;
  return new Uint8Array([raw & 0xff, (raw >>> 8) & 0xff, (raw >>> 16) & 0xff, (raw >>> 24) & 0xff]);
}
