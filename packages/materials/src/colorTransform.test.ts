import {
  cloneColorTransform,
  concatColorTransform,
  copyColorTransform,
  copyColorTransformToArrays,
  createColorTransform,
  equalsColorTransform,
  equalsColorTransformMultipliers,
  equalsColorTransformOffsets,
  getColorTransformOffsetRgb,
  getColorTransformOffsetRgba,
  invertColorTransform,
  isIdentityColorTransform,
  setColorTransform,
  setColorTransformIdentity,
  setColorTransformOffsetRgb,
  setColorTransformOffsetRgba,
} from '@flighthq/materials';

describe('cloneColorTransform', () => {
  it('returns a new object with identical values', () => {
    const ct = createColorTransform({ redMultiplier: 0.5, greenOffset: 64 });
    const cloned = cloneColorTransform(ct);
    expect(cloned).not.toBe(ct);
    expect(cloned.redMultiplier).toBe(0.5);
    expect(cloned.greenOffset).toBe(64);
  });

  it('does not share references', () => {
    const ct = createColorTransform({ redOffset: 10 });
    const c = cloneColorTransform(ct);
    c.redOffset = 99;
    expect(ct.redOffset).toBe(10);
  });
});

describe('concatColorTransform', () => {
  it('composes two setColorTransformIdentity transforms into setColorTransformIdentity', () => {
    const a = createColorTransform();
    const b = createColorTransform();
    const out = createColorTransform({ redMultiplier: 0, greenMultiplier: 0, blueMultiplier: 0, alphaMultiplier: 0 });
    concatColorTransform(out, a, b);
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
    const a = createColorTransform({ redMultiplier: 2, greenMultiplier: 0.5 });
    const b = createColorTransform({ redMultiplier: 3, greenMultiplier: 4 });
    const out = createColorTransform();
    concatColorTransform(out, a, b);
    expect(out.redMultiplier).toBe(6);
    expect(out.greenMultiplier).toBe(2);
  });

  it('combines offsets: out.offset = source.multiplier * other.offset + source.offset', () => {
    const source = createColorTransform({ redMultiplier: 2, redOffset: 10 });
    const other = createColorTransform({ redOffset: 5 });
    const out = createColorTransform();
    concatColorTransform(out, source, other);
    expect(out.redOffset).toBe(2 * 5 + 10);
  });

  it('can write result into one of the inputs', () => {
    const a = createColorTransform({ redMultiplier: 2, redOffset: 10 });
    const b = createColorTransform({ redMultiplier: 3, redOffset: 5 });
    const out = createColorTransform();
    concatColorTransform(out, a, b);
    const expectedMultiplier = 6;
    const expectedOffset = 2 * 5 + 10;
    expect(out.redMultiplier).toBe(expectedMultiplier);
    expect(out.redOffset).toBe(expectedOffset);
  });
});

describe('copyColorTransform', () => {
  it('copies all fields from source to out', () => {
    const source = createColorTransform({ redMultiplier: 0.5, greenOffset: 128, alphaMultiplier: 0.8, blueOffset: 64 });
    const out = createColorTransform();
    copyColorTransform(out, source);
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
    const source = createColorTransform({ redOffset: 50 });
    const out = createColorTransform();
    copyColorTransform(out, source);
    out.redOffset = 99;
    expect(source.redOffset).toBe(50);
  });
});

describe('copyColorTransformToArrays', () => {
  it('writes multipliers and offsets into parallel arrays', () => {
    const ct = createColorTransform({
      redMultiplier: 0.5,
      greenMultiplier: 0.25,
      blueMultiplier: 2,
      alphaMultiplier: 0.8,
    });
    setColorTransform(ct, 0.5, 0.25, 2, 0.8, 10, 20, 30, 40);
    const multipliers: number[] = [];
    const offsets: number[] = [];
    copyColorTransformToArrays(multipliers, offsets, ct);
    expect(multipliers).toEqual([0.5, 0.25, 2, 0.8]);
    expect(offsets).toEqual([10, 20, 30, 40]);
  });

  it('writes into existing arrays without creating new ones', () => {
    const ct = createColorTransform();
    const multipliers = [9, 9, 9, 9];
    const offsets = [9, 9, 9, 9];
    copyColorTransformToArrays(multipliers, offsets, ct);
    expect(multipliers).toEqual([1, 1, 1, 1]);
    expect(offsets).toEqual([0, 0, 0, 0]);
  });
});

describe('createColorTransform', () => {
  it('initializes multipliers to 1 and offsets to 0 by default', () => {
    const ct = createColorTransform();
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
    const ct = createColorTransform({ redMultiplier: 0.5, blueOffset: 128 });
    expect(ct.redMultiplier).toBe(0.5);
    expect(ct.greenMultiplier).toBe(1);
    expect(ct.blueOffset).toBe(128);
    expect(ct.alphaOffset).toBe(0);
  });
});

describe('equalsColorTransform', () => {
  it('returns true for two setColorTransformIdentity transforms', () => {
    expect(equalsColorTransform(createColorTransform(), createColorTransform())).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(equalsColorTransform(createColorTransform({ redMultiplier: 0.5 }), createColorTransform())).toBe(false);
    expect(equalsColorTransform(createColorTransform({ redOffset: 1 }), createColorTransform())).toBe(false);
    expect(equalsColorTransform(createColorTransform({ alphaMultiplier: 0 }), createColorTransform())).toBe(false);
    expect(equalsColorTransform(createColorTransform({ alphaOffset: 1 }), createColorTransform())).toBe(false);
  });

  it('returns true for matching non-setColorTransformIdentity transforms', () => {
    const a = createColorTransform({ redMultiplier: 0.5, greenOffset: 128 });
    const b = createColorTransform({ redMultiplier: 0.5, greenOffset: 128 });
    expect(equalsColorTransform(a, b)).toBe(true);
  });
});

describe('equalsColorTransformMultipliers', () => {
  it('returns true when all multipliers match', () => {
    const a = createColorTransform({ redMultiplier: 0.5, greenMultiplier: 0.25 });
    const b = createColorTransform({ redMultiplier: 0.5, greenMultiplier: 0.25 });
    expect(equalsColorTransformMultipliers(a, b)).toBe(true);
  });

  it('returns false when any multiplier differs', () => {
    expect(equalsColorTransformMultipliers(createColorTransform({ redMultiplier: 0.5 }), createColorTransform())).toBe(
      false,
    );
    expect(
      equalsColorTransformMultipliers(createColorTransform({ alphaMultiplier: 0.5 }), createColorTransform()),
    ).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = createColorTransform({ alphaMultiplier: 0.5 });
    const b = createColorTransform({ alphaMultiplier: 1 });
    expect(equalsColorTransformMultipliers(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = createColorTransform({ redMultiplier: 0.5 });
    const b = createColorTransform({ redMultiplier: 1 });
    expect(equalsColorTransformMultipliers(a, b, false)).toBe(false);
  });
});

describe('equalsColorTransformOffsets', () => {
  it('returns true when all offsets match', () => {
    const a = createColorTransform({ redOffset: 64, greenOffset: 128 });
    const b = createColorTransform({ redOffset: 64, greenOffset: 128 });
    expect(equalsColorTransformOffsets(a, b)).toBe(true);
  });

  it('returns false when any offset differs', () => {
    expect(equalsColorTransformOffsets(createColorTransform({ redOffset: 1 }), createColorTransform())).toBe(false);
    expect(equalsColorTransformOffsets(createColorTransform({ alphaOffset: 1 }), createColorTransform())).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = createColorTransform({ alphaOffset: 50 });
    const b = createColorTransform({ alphaOffset: 0 });
    expect(equalsColorTransformOffsets(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = createColorTransform({ redOffset: 50 });
    const b = createColorTransform({ redOffset: 0 });
    expect(equalsColorTransformOffsets(a, b, false)).toBe(false);
  });
});

describe('getColorTransformOffsetRgb', () => {
  it('packs red, green, blue offsets into a single integer', () => {
    const ct = createColorTransform({ redOffset: 0xff, greenOffset: 0x80, blueOffset: 0x10 });
    const packed = getColorTransformOffsetRgb(ct);
    expect((packed >> 16) & 0xff).toBe(0xff);
    expect((packed >> 8) & 0xff).toBe(0x80);
    expect(packed & 0xff).toBe(0x10);
  });

  it('returns 0 when all offsets are 0', () => {
    expect(getColorTransformOffsetRgb(createColorTransform())).toBe(0);
  });
});

describe('getColorTransformOffsetRgba', () => {
  it('packs red, green, blue, alpha offsets into a single integer', () => {
    const ct = createColorTransform({ redOffset: 0x10, greenOffset: 0x20, blueOffset: 0x30, alphaOffset: 0x40 });
    const packed = getColorTransformOffsetRgba(ct);
    expect((packed >> 24) & 0xff).toBe(0x10);
    expect((packed >> 16) & 0xff).toBe(0x20);
    expect((packed >> 8) & 0xff).toBe(0x30);
    expect(packed & 0xff).toBe(0x40);
  });

  it('returns 0 when all offsets are 0', () => {
    expect(getColorTransformOffsetRgba(createColorTransform())).toBe(0);
  });
});

describe('invertColorTransform', () => {
  it('reciprocates multipliers', () => {
    const source = createColorTransform({
      redMultiplier: 2,
      greenMultiplier: 4,
      blueMultiplier: 0.5,
      alphaMultiplier: 0.25,
    });
    const out = createColorTransform();
    invertColorTransform(out, source);
    expect(out.redMultiplier).toBe(0.5);
    expect(out.greenMultiplier).toBe(0.25);
    expect(out.blueMultiplier).toBe(2);
    expect(out.alphaMultiplier).toBe(4);
  });

  it('negates offsets', () => {
    const source = createColorTransform({ redOffset: 64, greenOffset: -32, blueOffset: 128, alphaOffset: -10 });
    const out = createColorTransform();
    invertColorTransform(out, source);
    expect(out.redOffset).toBe(-64);
    expect(out.greenOffset).toBe(32);
    expect(out.blueOffset).toBe(-128);
    expect(out.alphaOffset).toBe(10);
  });

  it('uses 1 when multiplier is 0 to avoid division by zero', () => {
    const source = createColorTransform({
      redMultiplier: 0,
      greenMultiplier: 0,
      blueMultiplier: 0,
      alphaMultiplier: 0,
    });
    const out = createColorTransform();
    invertColorTransform(out, source);
    expect(out.redMultiplier).toBe(1);
    expect(out.greenMultiplier).toBe(1);
    expect(out.blueMultiplier).toBe(1);
    expect(out.alphaMultiplier).toBe(1);
  });
});

describe('isIdentityColorTransform', () => {
  it('returns true for a default transform', () => {
    expect(isIdentityColorTransform(createColorTransform())).toBe(true);
  });

  it('returns false when any multiplier differs from 1', () => {
    expect(isIdentityColorTransform(createColorTransform({ redMultiplier: 0.5 }))).toBe(false);
  });

  it('returns false when any offset is non-zero', () => {
    expect(isIdentityColorTransform(createColorTransform({ greenOffset: 1 }))).toBe(false);
  });

  it('returns true when alphaMultiplier differs but compareAlphaMultiplier is false', () => {
    expect(isIdentityColorTransform(createColorTransform({ alphaMultiplier: 0 }), false)).toBe(true);
  });
});

describe('setColorTransform', () => {
  it('sets all eight fields', () => {
    const ct = createColorTransform();
    setColorTransform(ct, 0.1, 0.2, 0.3, 0.4, 10, 20, 30, 40);
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

describe('setColorTransformIdentity', () => {
  it('resets multipliers to 1 and offsets to 0', () => {
    const ct = createColorTransform({ redMultiplier: 0.5, greenOffset: 128, alphaMultiplier: 0, blueOffset: 64 });
    setColorTransformIdentity(ct);
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

describe('setColorTransformOffsetRgb', () => {
  it('unpacks red, green, blue from a packed integer', () => {
    const ct = createColorTransform();
    setColorTransformOffsetRgb(ct, (0xab << 16) | (0xcd << 8) | 0xef);
    expect(ct.redOffset).toBe(0xab);
    expect(ct.greenOffset).toBe(0xcd);
    expect(ct.blueOffset).toBe(0xef);
    expect(ct.alphaOffset).toBe(0);
  });

  it('zeroes RGB multipliers and keeps alphaMultiplier at 1', () => {
    const ct = createColorTransform();
    setColorTransformOffsetRgb(ct, 0xffffff);
    expect(ct.redMultiplier).toBe(0);
    expect(ct.greenMultiplier).toBe(0);
    expect(ct.blueMultiplier).toBe(0);
    expect(ct.alphaMultiplier).toBe(1);
  });
});

describe('setColorTransformOffsetRgba', () => {
  it('unpacks red, green, blue, alpha from a packed integer', () => {
    const ct = createColorTransform();
    setColorTransformOffsetRgba(ct, (0x10 << 24) | (0x20 << 16) | (0x30 << 8) | 0x40);
    expect(ct.redOffset).toBe(0x10);
    expect(ct.greenOffset).toBe(0x20);
    expect(ct.blueOffset).toBe(0x30);
    expect(ct.alphaOffset).toBe(0x40);
  });

  it('zeroes all multipliers including alpha', () => {
    const ct = createColorTransform();
    setColorTransformOffsetRgba(ct, 0xffffffff);
    expect(ct.redMultiplier).toBe(0);
    expect(ct.greenMultiplier).toBe(0);
    expect(ct.blueMultiplier).toBe(0);
    expect(ct.alphaMultiplier).toBe(0);
  });
});
