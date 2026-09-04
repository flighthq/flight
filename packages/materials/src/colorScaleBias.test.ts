import {
  cloneColorScaleBias,
  concatColorScaleBias,
  copyColorScaleBias,
  copyColorScaleBiasToArrays,
  createColorScaleBias,
  equalsColorScaleBias,
  equalsColorScaleBiasScales,
  equalsColorScaleBiasBiases,
  getColorScaleBiasBiasRgb,
  getColorScaleBiasBiasRgba,
  invertColorScaleBias,
  isIdentityColorScaleBias,
  setColorScaleBias,
  setColorScaleBiasIdentity,
  setColorScaleBiasBiasRgb,
  setColorScaleBiasBiasRgba,
} from '@flighthq/materials/contract';

import { initializeColorScaleBias } from './colorScaleBias';

describe('cloneColorScaleBias', () => {
  it('returns a new object with identical values', () => {
    const ct = createColorScaleBias({ redScale: 0.5, greenBias: 64 });
    const cloned = cloneColorScaleBias(ct);
    expect(cloned).not.toBe(ct);
    expect(cloned.redScale).toBe(0.5);
    expect(cloned.greenBias).toBe(64);
  });

  it('does not share references', () => {
    const ct = createColorScaleBias({ redBias: 10 });
    const c = cloneColorScaleBias(ct);
    c.redBias = 99;
    expect(ct.redBias).toBe(10);
  });
});

describe('concatColorScaleBias', () => {
  it('composes two setColorScaleBiasIdentity transforms into setColorScaleBiasIdentity', () => {
    const a = createColorScaleBias();
    const b = createColorScaleBias();
    const out = createColorScaleBias({ redScale: 0, greenScale: 0, blueScale: 0, alphaScale: 0 });
    concatColorScaleBias(out, a, b);
    expect(out.redScale).toBe(1);
    expect(out.greenScale).toBe(1);
    expect(out.blueScale).toBe(1);
    expect(out.alphaScale).toBe(1);
    expect(out.redBias).toBe(0);
    expect(out.greenBias).toBe(0);
    expect(out.blueBias).toBe(0);
    expect(out.alphaBias).toBe(0);
  });

  it('multiplies scales', () => {
    const a = createColorScaleBias({ redScale: 2, greenScale: 0.5 });
    const b = createColorScaleBias({ redScale: 3, greenScale: 4 });
    const out = createColorScaleBias();
    concatColorScaleBias(out, a, b);
    expect(out.redScale).toBe(6);
    expect(out.greenScale).toBe(2);
  });

  it('combines biases: out.bias = source.scale * other.bias + source.bias', () => {
    const source = createColorScaleBias({ redScale: 2, redBias: 10 });
    const other = createColorScaleBias({ redBias: 5 });
    const out = createColorScaleBias();
    concatColorScaleBias(out, source, other);
    expect(out.redBias).toBe(2 * 5 + 10);
  });

  it('produces correct result when out aliases source', () => {
    const a = createColorScaleBias({
      redScale: 2,
      greenScale: 0.5,
      blueScale: 3,
      alphaScale: 0.25,
      redBias: 10,
      greenBias: 20,
      blueBias: 30,
      alphaBias: 40,
    });
    const b = createColorScaleBias({
      redScale: 3,
      greenScale: 4,
      blueScale: 0.5,
      alphaScale: 2,
      redBias: 5,
      greenBias: 15,
      blueBias: 25,
      alphaBias: 35,
    });
    const ref = createColorScaleBias();
    concatColorScaleBias(ref, a, b);
    concatColorScaleBias(a, a, b);
    expect(a.redScale).toBe(ref.redScale);
    expect(a.greenScale).toBe(ref.greenScale);
    expect(a.blueScale).toBe(ref.blueScale);
    expect(a.alphaScale).toBe(ref.alphaScale);
    expect(a.redBias).toBe(ref.redBias);
    expect(a.greenBias).toBe(ref.greenBias);
    expect(a.blueBias).toBe(ref.blueBias);
    expect(a.alphaBias).toBe(ref.alphaBias);
  });

  it('produces correct result when out aliases other', () => {
    const a = createColorScaleBias({
      redScale: 2,
      greenScale: 0.5,
      blueScale: 3,
      alphaScale: 0.25,
      redBias: 10,
      greenBias: 20,
      blueBias: 30,
      alphaBias: 40,
    });
    const b = createColorScaleBias({
      redScale: 3,
      greenScale: 4,
      blueScale: 0.5,
      alphaScale: 2,
      redBias: 5,
      greenBias: 15,
      blueBias: 25,
      alphaBias: 35,
    });
    const ref = createColorScaleBias();
    concatColorScaleBias(ref, a, b);
    concatColorScaleBias(b, a, b);
    expect(b.redScale).toBe(ref.redScale);
    expect(b.greenScale).toBe(ref.greenScale);
    expect(b.blueScale).toBe(ref.blueScale);
    expect(b.alphaScale).toBe(ref.alphaScale);
    expect(b.redBias).toBe(ref.redBias);
    expect(b.greenBias).toBe(ref.greenBias);
    expect(b.blueBias).toBe(ref.blueBias);
    expect(b.alphaBias).toBe(ref.alphaBias);
  });
});

describe('copyColorScaleBias', () => {
  it('copies all fields from source to out', () => {
    const source = createColorScaleBias({ redScale: 0.5, greenBias: 128, alphaScale: 0.8, blueBias: 64 });
    const out = createColorScaleBias();
    copyColorScaleBias(out, source);
    expect(out.redScale).toBe(0.5);
    expect(out.greenScale).toBe(1);
    expect(out.blueScale).toBe(1);
    expect(out.alphaScale).toBe(0.8);
    expect(out.redBias).toBe(0);
    expect(out.greenBias).toBe(128);
    expect(out.blueBias).toBe(64);
    expect(out.alphaBias).toBe(0);
  });

  it('does not share references between out and source', () => {
    const source = createColorScaleBias({ redBias: 50 });
    const out = createColorScaleBias();
    copyColorScaleBias(out, source);
    out.redBias = 99;
    expect(source.redBias).toBe(50);
  });
});

describe('copyColorScaleBiasToArrays', () => {
  it('writes scales and biases into parallel arrays', () => {
    const ct = createColorScaleBias({
      redScale: 0.5,
      greenScale: 0.25,
      blueScale: 2,
      alphaScale: 0.8,
    });
    setColorScaleBias(ct, 0.5, 0.25, 2, 0.8, 10, 20, 30, 40);
    const scales: number[] = [];
    const biases: number[] = [];
    copyColorScaleBiasToArrays(scales, biases, ct);
    expect(scales).toEqual([0.5, 0.25, 2, 0.8]);
    expect(biases).toEqual([10, 20, 30, 40]);
  });

  it('writes into existing arrays without creating new ones', () => {
    const ct = createColorScaleBias();
    const scales = [9, 9, 9, 9];
    const biases = [9, 9, 9, 9];
    copyColorScaleBiasToArrays(scales, biases, ct);
    expect(scales).toEqual([1, 1, 1, 1]);
    expect(biases).toEqual([0, 0, 0, 0]);
  });
});

describe('createColorScaleBias', () => {
  it('initializes scales to 1 and biases to 0 by default', () => {
    const ct = createColorScaleBias();
    expect(ct.redScale).toBe(1);
    expect(ct.greenScale).toBe(1);
    expect(ct.blueScale).toBe(1);
    expect(ct.alphaScale).toBe(1);
    expect(ct.redBias).toBe(0);
    expect(ct.greenBias).toBe(0);
    expect(ct.blueBias).toBe(0);
    expect(ct.alphaBias).toBe(0);
  });

  it('applies partial overrides', () => {
    const ct = createColorScaleBias({ redScale: 0.5, blueBias: 128 });
    expect(ct.redScale).toBe(0.5);
    expect(ct.greenScale).toBe(1);
    expect(ct.blueBias).toBe(128);
    expect(ct.alphaBias).toBe(0);
  });
});

describe('equalsColorScaleBias', () => {
  it('returns true for two setColorScaleBiasIdentity transforms', () => {
    expect(equalsColorScaleBias(createColorScaleBias(), createColorScaleBias())).toBe(true);
  });

  it('returns false when any field differs', () => {
    expect(equalsColorScaleBias(createColorScaleBias({ redScale: 0.5 }), createColorScaleBias())).toBe(false);
    expect(equalsColorScaleBias(createColorScaleBias({ redBias: 1 }), createColorScaleBias())).toBe(false);
    expect(equalsColorScaleBias(createColorScaleBias({ alphaScale: 0 }), createColorScaleBias())).toBe(false);
    expect(equalsColorScaleBias(createColorScaleBias({ alphaBias: 1 }), createColorScaleBias())).toBe(false);
  });

  it('returns true for matching non-setColorScaleBiasIdentity transforms', () => {
    const a = createColorScaleBias({ redScale: 0.5, greenBias: 128 });
    const b = createColorScaleBias({ redScale: 0.5, greenBias: 128 });
    expect(equalsColorScaleBias(a, b)).toBe(true);
  });
});

describe('equalsColorScaleBiasBiases', () => {
  it('returns true when all biases match', () => {
    const a = createColorScaleBias({ redBias: 64, greenBias: 128 });
    const b = createColorScaleBias({ redBias: 64, greenBias: 128 });
    expect(equalsColorScaleBiasBiases(a, b)).toBe(true);
  });

  it('returns false when any bias differs', () => {
    expect(equalsColorScaleBiasBiases(createColorScaleBias({ redBias: 1 }), createColorScaleBias())).toBe(false);
    expect(equalsColorScaleBiasBiases(createColorScaleBias({ alphaBias: 1 }), createColorScaleBias())).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = createColorScaleBias({ alphaBias: 50 });
    const b = createColorScaleBias({ alphaBias: 0 });
    expect(equalsColorScaleBiasBiases(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = createColorScaleBias({ redBias: 50 });
    const b = createColorScaleBias({ redBias: 0 });
    expect(equalsColorScaleBiasBiases(a, b, false)).toBe(false);
  });
});

describe('equalsColorScaleBiasScales', () => {
  it('returns true when all scales match', () => {
    const a = createColorScaleBias({ redScale: 0.5, greenScale: 0.25 });
    const b = createColorScaleBias({ redScale: 0.5, greenScale: 0.25 });
    expect(equalsColorScaleBiasScales(a, b)).toBe(true);
  });

  it('returns false when any scale differs', () => {
    expect(equalsColorScaleBiasScales(createColorScaleBias({ redScale: 0.5 }), createColorScaleBias())).toBe(false);
    expect(equalsColorScaleBiasScales(createColorScaleBias({ alphaScale: 0.5 }), createColorScaleBias())).toBe(false);
  });

  it('ignores alpha when compareAlpha is false', () => {
    const a = createColorScaleBias({ alphaScale: 0.5 });
    const b = createColorScaleBias({ alphaScale: 1 });
    expect(equalsColorScaleBiasScales(a, b, false)).toBe(true);
  });

  it('still compares RGB when compareAlpha is false', () => {
    const a = createColorScaleBias({ redScale: 0.5 });
    const b = createColorScaleBias({ redScale: 1 });
    expect(equalsColorScaleBiasScales(a, b, false)).toBe(false);
  });
});

describe('getColorScaleBiasBiasRgb', () => {
  it('packs red, green, blue biases into a single integer', () => {
    const ct = createColorScaleBias({ redBias: 1, greenBias: 0x80 / 255, blueBias: 0x10 / 255 });
    const packed = getColorScaleBiasBiasRgb(ct);
    expect((packed >> 16) & 0xff).toBe(0xff);
    expect((packed >> 8) & 0xff).toBe(0x80);
    expect(packed & 0xff).toBe(0x10);
  });

  it('returns 0 when all biases are 0', () => {
    expect(getColorScaleBiasBiasRgb(createColorScaleBias())).toBe(0);
  });
});

describe('getColorScaleBiasBiasRgba', () => {
  it('packs red, green, blue, alpha biases into a single integer', () => {
    const ct = createColorScaleBias({
      redBias: 0x10 / 255,
      greenBias: 0x20 / 255,
      blueBias: 0x30 / 255,
      alphaBias: 0x40 / 255,
    });
    const packed = getColorScaleBiasBiasRgba(ct);
    expect((packed >> 24) & 0xff).toBe(0x10);
    expect((packed >> 16) & 0xff).toBe(0x20);
    expect((packed >> 8) & 0xff).toBe(0x30);
    expect(packed & 0xff).toBe(0x40);
  });

  it('returns 0 when all biases are 0', () => {
    expect(getColorScaleBiasBiasRgba(createColorScaleBias())).toBe(0);
  });
});

describe('initializeColorScaleBias', () => {
  it('is the construction initializer of createColorScaleBias', () => {
    expect(typeof initializeColorScaleBias).toBe('function');
  });
});

describe('invertColorScaleBias', () => {
  it('reciprocates scales', () => {
    const source = createColorScaleBias({
      redScale: 2,
      greenScale: 4,
      blueScale: 0.5,
      alphaScale: 0.25,
    });
    const out = createColorScaleBias();
    invertColorScaleBias(out, source);
    expect(out.redScale).toBe(0.5);
    expect(out.greenScale).toBe(0.25);
    expect(out.blueScale).toBe(2);
    expect(out.alphaScale).toBe(4);
  });

  it('negates biases', () => {
    const source = createColorScaleBias({ redBias: 64, greenBias: -32, blueBias: 128, alphaBias: -10 });
    const out = createColorScaleBias();
    invertColorScaleBias(out, source);
    expect(out.redBias).toBe(-64);
    expect(out.greenBias).toBe(32);
    expect(out.blueBias).toBe(-128);
    expect(out.alphaBias).toBe(10);
  });

  it('uses 1 when scale is 0 to avoid division by zero', () => {
    const source = createColorScaleBias({
      redScale: 0,
      greenScale: 0,
      blueScale: 0,
      alphaScale: 0,
    });
    const out = createColorScaleBias();
    invertColorScaleBias(out, source);
    expect(out.redScale).toBe(1);
    expect(out.greenScale).toBe(1);
    expect(out.blueScale).toBe(1);
    expect(out.alphaScale).toBe(1);
  });
});

describe('isIdentityColorScaleBias', () => {
  it('returns true for a default transform', () => {
    expect(isIdentityColorScaleBias(createColorScaleBias())).toBe(true);
  });

  it('returns false when any scale differs from 1', () => {
    expect(isIdentityColorScaleBias(createColorScaleBias({ redScale: 0.5 }))).toBe(false);
  });

  it('returns false when any bias is non-zero', () => {
    expect(isIdentityColorScaleBias(createColorScaleBias({ greenBias: 1 }))).toBe(false);
  });

  it('returns true when alphaScale differs but compareAlphaScale is false', () => {
    expect(isIdentityColorScaleBias(createColorScaleBias({ alphaScale: 0 }), false)).toBe(true);
  });
});

describe('setColorScaleBias', () => {
  it('sets all eight fields', () => {
    const ct = createColorScaleBias();
    setColorScaleBias(ct, 0.1, 0.2, 0.3, 0.4, 10, 20, 30, 40);
    expect(ct.redScale).toBe(0.1);
    expect(ct.greenScale).toBe(0.2);
    expect(ct.blueScale).toBe(0.3);
    expect(ct.alphaScale).toBe(0.4);
    expect(ct.redBias).toBe(10);
    expect(ct.greenBias).toBe(20);
    expect(ct.blueBias).toBe(30);
    expect(ct.alphaBias).toBe(40);
  });
});

describe('setColorScaleBiasBiasRgb', () => {
  it('unpacks red, green, blue from a packed integer', () => {
    const ct = createColorScaleBias();
    setColorScaleBiasBiasRgb(ct, (0xab << 16) | (0xcd << 8) | 0xef);
    expect(ct.redBias).toBeCloseTo(0xab / 255);
    expect(ct.greenBias).toBeCloseTo(0xcd / 255);
    expect(ct.blueBias).toBeCloseTo(0xef / 255);
    expect(ct.alphaBias).toBe(0);
  });

  it('zeroes RGB scales and keeps alphaScale at 1', () => {
    const ct = createColorScaleBias();
    setColorScaleBiasBiasRgb(ct, 0xffffff);
    expect(ct.redScale).toBe(0);
    expect(ct.greenScale).toBe(0);
    expect(ct.blueScale).toBe(0);
    expect(ct.alphaScale).toBe(1);
  });
});

describe('setColorScaleBiasBiasRgba', () => {
  it('unpacks red, green, blue, alpha from a packed integer', () => {
    const ct = createColorScaleBias();
    setColorScaleBiasBiasRgba(ct, (0x10 << 24) | (0x20 << 16) | (0x30 << 8) | 0x40);
    expect(ct.redBias).toBeCloseTo(0x10 / 255);
    expect(ct.greenBias).toBeCloseTo(0x20 / 255);
    expect(ct.blueBias).toBeCloseTo(0x30 / 255);
    expect(ct.alphaBias).toBeCloseTo(0x40 / 255);
  });

  it('zeroes all scales including alpha', () => {
    const ct = createColorScaleBias();
    setColorScaleBiasBiasRgba(ct, 0xffffffff);
    expect(ct.redScale).toBe(0);
    expect(ct.greenScale).toBe(0);
    expect(ct.blueScale).toBe(0);
    expect(ct.alphaScale).toBe(0);
  });
});
describe('setColorScaleBiasIdentity', () => {
  it('resets scales to 1 and biases to 0', () => {
    const ct = createColorScaleBias({ redScale: 0.5, greenBias: 128, alphaScale: 0, blueBias: 64 });
    setColorScaleBiasIdentity(ct);
    expect(ct.redScale).toBe(1);
    expect(ct.greenScale).toBe(1);
    expect(ct.blueScale).toBe(1);
    expect(ct.alphaScale).toBe(1);
    expect(ct.redBias).toBe(0);
    expect(ct.greenBias).toBe(0);
    expect(ct.blueBias).toBe(0);
    expect(ct.alphaBias).toBe(0);
  });
});
