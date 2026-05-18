import { colorTransform } from '@flighthq/materials';

const {
  clone,
  concat,
  copy,
  create,
  equals,
  getOffsetRGB,
  getOffsetRGBA,
  identity,
  invert,
  isIdentity,
  multiplierEquals,
  offsetEquals,
  setOffsetRGB,
  setOffsetRGBA,
  setTo,
  toArrays,
} = colorTransform;

describe('create', () => {
  it('initializes multipliers to 1 and offsets to 0 by default', () => {
    const ct = create();
    expect(ct.redMultiplier).toBe(1);
    expect(ct.greenMultiplier).toBe(1);
    expect(ct.blueMultiplier).toBe(1);
    expect(ct.alphaMultiplier).toBe(1);
    expect(ct.redOffset).toBe(0);
    expect(ct.greenOffset).toBe(0);
    expect(ct.blueOffset).toBe(0);
    expect(ct.alphaOffset).toBe(0);
  });

  it('applies partial overrides', () => {
    const ct = create({ redMultiplier: 0.5, blueOffset: 128 });
    expect(ct.redMultiplier).toBe(0.5);
    expect(ct.greenMultiplier).toBe(1);
    expect(ct.blueOffset).toBe(128);
    expect(ct.alphaOffset).toBe(0);
  });
});

describe('clone', () => {
  it('returns a new object with identical values', () => {
    const ct = create({ redMultiplier: 0.5, greenOffset: 64 });
    const copy = clone(ct);
    expect(copy).not.toBe(ct);
    expect(copy.redMultiplier).toBe(0.5);
    expect(copy.greenOffset).toBe(64);
  });

  it('does not share references', () => {
    const ct = create({ redOffset: 10 });
    const c = clone(ct);
    c.redOffset = 99;
    expect(ct.redOffset).toBe(10);
  });
});

describe('concat', () => {
  it('composes two identity transforms into identity', () => {
    const a = create();
    const b = create();
    const out = create({ redMultiplier: 0, greenMultiplier: 0, blueMultiplier: 0, alphaMultiplier: 0 });
    concat(out, a, b);
    expect(out.redMultiplier).toBe(1);
    expect(out.greenMultiplier).toBe(1);
    expect(out.blueMultiplier).toBe(1);
    expect(out.alphaMultiplier).toBe(1);
    expect(out.redOffset).toBe(0);
    expect(out.greenOffset).toBe(0);
    expect(out.blueOffset).toBe(0);
    expect(out.alphaOffset).toBe(0);
  });

  it('multiplies multipliers', () => {
    const a = create({ redMultiplier: 2, greenMultiplier: 0.5 });
    const b = create({ redMultiplier: 3, greenMultiplier: 4 });
    const out = create();
    concat(out, a, b);
    expect(out.redMultiplier).toBe(6);
    expect(out.greenMultiplier).toBe(2);
  });

  it('combines offsets: out.offset = source.multiplier * other.offset + source.offset', () => {
    const source = create({ redMultiplier: 2, redOffset: 10 });
    const other = create({ redOffset: 5 });
    const out = create();
    concat(out, source, other);
    expect(out.redOffset).toBe(2 * 5 + 10);
  });

  it('can write result into one of the inputs', () => {
    const a = create({ redMultiplier: 2, redOffset: 10 });
    const b = create({ redMultiplier: 3, redOffset: 5 });
    const out = create();
    concat(out, a, b);
    const expectedMultiplier = 6;
    const expectedOffset = 2 * 5 + 10;
    expect(out.redMultiplier).toBe(expectedMultiplier);
    expect(out.redOffset).toBe(expectedOffset);
  });
});

describe('copy', () => {
  it('copies all fields from source to out', () => {
    const source = create({ redMultiplier: 0.5, greenOffset: 128, alphaMultiplier: 0.8, blueOffset: 64 });
    const out = create();
    copy(out, source);
    expect(out.redMultiplier).toBe(0.5);
    expect(out.greenMultiplier).toBe(1);
    expect(out.blueMultiplier).toBe(1);
    expect(out.alphaMultiplier).toBe(0.8);
    expect(out.redOffset).toBe(0);
    expect(out.greenOffset).toBe(128);
    expect(out.blueOffset).toBe(64);
    expect(out.alphaOffset).toBe(0);
  });

  it('does not share references between out and source', () => {
    const source = create({ redOffset: 50 });
    const out = create();
    copy(out, source);
    out.redOffset = 99;
    expect(source.redOffset).toBe(50);
  });
});

describe('equals', () => {
  it('returns true for two identity transforms', () => {
    expect(equals(create(), create())).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(equals(create({ redMultiplier: 0.5 }), create())).toBe(false);
    expect(equals(create({ redOffset: 1 }), create())).toBe(false);
    expect(equals(create({ alphaMultiplier: 0 }), create())).toBe(false);
    expect(equals(create({ alphaOffset: 1 }), create())).toBe(false);
  });

  it('returns true for matching non-identity transforms', () => {
    const a = create({ redMultiplier: 0.5, greenOffset: 128 });
    const b = create({ redMultiplier: 0.5, greenOffset: 128 });
    expect(equals(a, b)).toBe(true);
  });
});

describe('getOffsetRGB', () => {
  it('packs red, green, blue offsets into a single integer', () => {
    const ct = create({ redOffset: 0xff, greenOffset: 0x80, blueOffset: 0x10 });
    const packed = getOffsetRGB(ct);
    expect((packed >> 16) & 0xff).toBe(0xff);
    expect((packed >> 8) & 0xff).toBe(0x80);
    expect(packed & 0xff).toBe(0x10);
  });

  it('returns 0 when all offsets are 0', () => {
    expect(getOffsetRGB(create())).toBe(0);
  });
});

describe('getOffsetRGBA', () => {
  it('packs red, green, blue, alpha offsets into a single integer', () => {
    const ct = create({ redOffset: 0x10, greenOffset: 0x20, blueOffset: 0x30, alphaOffset: 0x40 });
    const packed = getOffsetRGBA(ct);
    expect((packed >> 24) & 0xff).toBe(0x10);
    expect((packed >> 16) & 0xff).toBe(0x20);
    expect((packed >> 8) & 0xff).toBe(0x30);
    expect(packed & 0xff).toBe(0x40);
  });

  it('returns 0 when all offsets are 0', () => {
    expect(getOffsetRGBA(create())).toBe(0);
  });
});

describe('identity', () => {
  it('resets multipliers to 1 and offsets to 0', () => {
    const ct = create({ redMultiplier: 0.5, greenOffset: 128, alphaMultiplier: 0, blueOffset: 64 });
    identity(ct);
    expect(ct.redMultiplier).toBe(1);
    expect(ct.greenMultiplier).toBe(1);
    expect(ct.blueMultiplier).toBe(1);
    expect(ct.alphaMultiplier).toBe(1);
    expect(ct.redOffset).toBe(0);
    expect(ct.greenOffset).toBe(0);
    expect(ct.blueOffset).toBe(0);
    expect(ct.alphaOffset).toBe(0);
  });
});

describe('invert', () => {
  it('reciprocates multipliers', () => {
    const source = create({ redMultiplier: 2, greenMultiplier: 4, blueMultiplier: 0.5, alphaMultiplier: 0.25 });
    const out = create();
    invert(out, source);
    expect(out.redMultiplier).toBe(0.5);
    expect(out.greenMultiplier).toBe(0.25);
    expect(out.blueMultiplier).toBe(2);
    expect(out.alphaMultiplier).toBe(4);
  });

  it('negates offsets', () => {
    const source = create({ redOffset: 64, greenOffset: -32, blueOffset: 128, alphaOffset: -10 });
    const out = create();
    invert(out, source);
    expect(out.redOffset).toBe(-64);
    expect(out.greenOffset).toBe(32);
    expect(out.blueOffset).toBe(-128);
    expect(out.alphaOffset).toBe(10);
  });

  it('uses 1 when multiplier is 0 to avoid division by zero', () => {
    const source = create({ redMultiplier: 0, greenMultiplier: 0, blueMultiplier: 0, alphaMultiplier: 0 });
    const out = create();
    invert(out, source);
    expect(out.redMultiplier).toBe(1);
    expect(out.greenMultiplier).toBe(1);
    expect(out.blueMultiplier).toBe(1);
    expect(out.alphaMultiplier).toBe(1);
  });
});

describe('isIdentity', () => {
  it('returns true for a default transform', () => {
    expect(isIdentity(create())).toBe(true);
  });

  it('returns false when any multiplier differs from 1', () => {
    expect(isIdentity(create({ redMultiplier: 0.5 }))).toBe(false);
  });

  it('returns false when any offset is non-zero', () => {
    expect(isIdentity(create({ greenOffset: 1 }))).toBe(false);
  });

  it('returns true when alphaMultiplier differs but compareAlphaMultiplier is false', () => {
    expect(isIdentity(create({ alphaMultiplier: 0 }), false)).toBe(true);
  });
});

describe('multiplierEquals', () => {
  it('returns true when all multipliers match', () => {
    const a = create({ redMultiplier: 0.5, greenMultiplier: 0.25 });
    const b = create({ redMultiplier: 0.5, greenMultiplier: 0.25 });
    expect(multiplierEquals(a, b)).toBe(true);
  });

  it('returns false when any multiplier differs', () => {
    expect(multiplierEquals(create({ redMultiplier: 0.5 }), create())).toBe(false);
    expect(multiplierEquals(create({ alphaMultiplier: 0.5 }), create())).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = create({ alphaMultiplier: 0.5 });
    const b = create({ alphaMultiplier: 1 });
    expect(multiplierEquals(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = create({ redMultiplier: 0.5 });
    const b = create({ redMultiplier: 1 });
    expect(multiplierEquals(a, b, false)).toBe(false);
  });
});

describe('offsetEquals', () => {
  it('returns true when all offsets match', () => {
    const a = create({ redOffset: 64, greenOffset: 128 });
    const b = create({ redOffset: 64, greenOffset: 128 });
    expect(offsetEquals(a, b)).toBe(true);
  });

  it('returns false when any offset differs', () => {
    expect(offsetEquals(create({ redOffset: 1 }), create())).toBe(false);
    expect(offsetEquals(create({ alphaOffset: 1 }), create())).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = create({ alphaOffset: 50 });
    const b = create({ alphaOffset: 0 });
    expect(offsetEquals(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = create({ redOffset: 50 });
    const b = create({ redOffset: 0 });
    expect(offsetEquals(a, b, false)).toBe(false);
  });
});

describe('setOffsetRGB', () => {
  it('unpacks red, green, blue from a packed integer', () => {
    const ct = create();
    setOffsetRGB(ct, (0xab << 16) | (0xcd << 8) | 0xef);
    expect(ct.redOffset).toBe(0xab);
    expect(ct.greenOffset).toBe(0xcd);
    expect(ct.blueOffset).toBe(0xef);
    expect(ct.alphaOffset).toBe(0);
  });

  it('zeroes RGB multipliers and keeps alphaMultiplier at 1', () => {
    const ct = create();
    setOffsetRGB(ct, 0xffffff);
    expect(ct.redMultiplier).toBe(0);
    expect(ct.greenMultiplier).toBe(0);
    expect(ct.blueMultiplier).toBe(0);
    expect(ct.alphaMultiplier).toBe(1);
  });
});

describe('setOffsetRGBA', () => {
  it('unpacks red, green, blue, alpha from a packed integer', () => {
    const ct = create();
    setOffsetRGBA(ct, (0x10 << 24) | (0x20 << 16) | (0x30 << 8) | 0x40);
    expect(ct.redOffset).toBe(0x10);
    expect(ct.greenOffset).toBe(0x20);
    expect(ct.blueOffset).toBe(0x30);
    expect(ct.alphaOffset).toBe(0x40);
  });

  it('zeroes all multipliers including alpha', () => {
    const ct = create();
    setOffsetRGBA(ct, 0xffffffff);
    expect(ct.redMultiplier).toBe(0);
    expect(ct.greenMultiplier).toBe(0);
    expect(ct.blueMultiplier).toBe(0);
    expect(ct.alphaMultiplier).toBe(0);
  });
});

describe('setTo', () => {
  it('sets all eight fields', () => {
    const ct = create();
    setTo(ct, 0.1, 0.2, 0.3, 0.4, 10, 20, 30, 40);
    expect(ct.redMultiplier).toBe(0.1);
    expect(ct.greenMultiplier).toBe(0.2);
    expect(ct.blueMultiplier).toBe(0.3);
    expect(ct.alphaMultiplier).toBe(0.4);
    expect(ct.redOffset).toBe(10);
    expect(ct.greenOffset).toBe(20);
    expect(ct.blueOffset).toBe(30);
    expect(ct.alphaOffset).toBe(40);
  });
});

describe('toArrays', () => {
  it('writes multipliers and offsets into parallel arrays', () => {
    const ct = create({ redMultiplier: 0.5, greenMultiplier: 0.25, blueMultiplier: 2, alphaMultiplier: 0.8 });
    setTo(ct, 0.5, 0.25, 2, 0.8, 10, 20, 30, 40);
    const multipliers: number[] = [];
    const offsets: number[] = [];
    toArrays(multipliers, offsets, ct);
    expect(multipliers).toEqual([0.5, 0.25, 2, 0.8]);
    expect(offsets).toEqual([10, 20, 30, 40]);
  });

  it('writes into existing arrays without creating new ones', () => {
    const ct = create();
    const multipliers = [9, 9, 9, 9];
    const offsets = [9, 9, 9, 9];
    toArrays(multipliers, offsets, ct);
    expect(multipliers).toEqual([1, 1, 1, 1]);
    expect(offsets).toEqual([0, 0, 0, 0]);
  });
});
