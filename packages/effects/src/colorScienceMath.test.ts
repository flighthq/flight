import {
  computeHslToRgb,
  computeLinearToSrgb,
  computeOklabToRgb,
  computeRgbToHsl,
  computeRgbToOklab,
  computeSrgbToLinear,
  getRec709LuminanceWeights,
  getRec2020LuminanceWeights,
} from './colorScienceMath';

describe('computeHslToRgb', () => {
  it('hue=0, full saturation, mid lightness → red', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeHslToRgb(0, 1, 0.5, out);
    expect(out[0]).toBeCloseTo(1, 4);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(0, 4);
  });
  it('round-trips with computeRgbToHsl', () => {
    const r = 0.3;
    const g = 0.7;
    const b = 0.1;
    const hsl: [number, number, number] = [0, 0, 0];
    computeRgbToHsl(r, g, b, hsl);
    const rgb: [number, number, number] = [0, 0, 0];
    computeHslToRgb(hsl[0], hsl[1], hsl[2], rgb);
    expect(rgb[0]).toBeCloseTo(r, 4);
    expect(rgb[1]).toBeCloseTo(g, 4);
    expect(rgb[2]).toBeCloseTo(b, 4);
  });
});

describe('computeLinearToSrgb', () => {
  it('0 maps to 0', () => {
    expect(computeLinearToSrgb(0)).toBeCloseTo(0, 5);
  });
  it('1 maps to 1', () => {
    expect(computeLinearToSrgb(1)).toBeCloseTo(1, 5);
  });
  it('round-trips with computeSrgbToLinear', () => {
    const linear = 0.5;
    expect(computeSrgbToLinear(computeLinearToSrgb(linear))).toBeCloseTo(linear, 4);
  });
  it('clamps negative values to 0', () => {
    expect(computeLinearToSrgb(-1)).toBeCloseTo(0, 5);
  });
});

describe('computeOklabToRgb', () => {
  it('round-trips with computeRgbToOklab for a mid-gray', () => {
    const r = 0.5;
    const g = 0.5;
    const b = 0.5;
    const lab: [number, number, number] = [0, 0, 0];
    computeRgbToOklab(r, g, b, lab);
    const rgb: [number, number, number] = [0, 0, 0];
    computeOklabToRgb(lab[0], lab[1], lab[2], rgb);
    expect(rgb[0]).toBeCloseTo(r, 3);
    expect(rgb[1]).toBeCloseTo(g, 3);
    expect(rgb[2]).toBeCloseTo(b, 3);
  });
  it('round-trips with computeRgbToOklab for a saturated color', () => {
    const r = 0.8;
    const g = 0.2;
    const b = 0.1;
    const lab: [number, number, number] = [0, 0, 0];
    computeRgbToOklab(r, g, b, lab);
    const rgb: [number, number, number] = [0, 0, 0];
    computeOklabToRgb(lab[0], lab[1], lab[2], rgb);
    expect(rgb[0]).toBeCloseTo(r, 3);
    expect(rgb[1]).toBeCloseTo(g, 3);
    expect(rgb[2]).toBeCloseTo(b, 3);
  });
});

describe('computeRgbToHsl', () => {
  it('red (1,0,0) has hue 0°', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToHsl(1, 0, 0, out);
    expect(out[0]).toBeCloseTo(0, 2);
    expect(out[1]).toBeCloseTo(1, 2);
    expect(out[2]).toBeCloseTo(0.5, 2);
  });
  it('green (0,1,0) has hue 120°', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToHsl(0, 1, 0, out);
    expect(out[0]).toBeCloseTo(120, 2);
  });
  it('white (1,1,1) has lightness 1 and saturation 0', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToHsl(1, 1, 1, out);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('black (0,0,0) has lightness 0 and saturation 0', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToHsl(0, 0, 0, out);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(0, 5);
  });
});

describe('computeRgbToOklab', () => {
  it('black (0,0,0) maps to L=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToOklab(0, 0, 0, out);
    expect(out[0]).toBeCloseTo(0, 4);
  });
  it('white (1,1,1) maps to L~1, a~0, b~0', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeRgbToOklab(1, 1, 1, out);
    expect(out[0]).toBeCloseTo(1, 2);
    expect(out[1]).toBeCloseTo(0, 3);
    expect(out[2]).toBeCloseTo(0, 3);
  });
});

describe('computeSrgbToLinear', () => {
  it('0 maps to 0', () => {
    expect(computeSrgbToLinear(0)).toBeCloseTo(0, 5);
  });
  it('1 maps to 1', () => {
    expect(computeSrgbToLinear(1)).toBeCloseTo(1, 5);
  });
  it('round-trips with computeLinearToSrgb', () => {
    const srgb = 0.5;
    expect(computeLinearToSrgb(computeSrgbToLinear(srgb))).toBeCloseTo(srgb, 4);
  });
});

describe('getRec2020LuminanceWeights', () => {
  it('weights sum to 1', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec2020LuminanceWeights(out);
    expect(out[0] + out[1] + out[2]).toBeCloseTo(1, 5);
  });
  it('returns canonical Rec.2020 values', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec2020LuminanceWeights(out);
    expect(out[0]).toBeCloseTo(0.2627, 4);
    expect(out[1]).toBeCloseTo(0.678, 4);
    expect(out[2]).toBeCloseTo(0.0593, 4);
  });
});

describe('getRec709LuminanceWeights', () => {
  it('weights sum to 1', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec709LuminanceWeights(out);
    expect(out[0] + out[1] + out[2]).toBeCloseTo(1, 5);
  });
  it('returns canonical Rec.709 values', () => {
    const out: [number, number, number] = [0, 0, 0];
    getRec709LuminanceWeights(out);
    expect(out[0]).toBeCloseTo(0.2126, 4);
    expect(out[1]).toBeCloseTo(0.7152, 4);
    expect(out[2]).toBeCloseTo(0.0722, 4);
  });
});
