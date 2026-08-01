import { clampLinearRgb, linearRgbToOklab, oklabToLinearRgb } from './oklab';

describe('clampLinearRgb', () => {
  it('explicitly clamps out-of-gamut channels to the displayable linear-sRGB range', () => {
    const rgb: [number, number, number] = [0, 0, 0];
    clampLinearRgb(rgb, 1.25, -0.2, 0.5);
    expect(rgb).toEqual([1, 0, 0.5]);
  });
});

describe('linearRgbToOklab', () => {
  it('maps linear white to L≈1, a≈0, b≈0', () => {
    const out: [number, number, number] = [0, 0, 0];
    linearRgbToOklab(out, 1, 1, 1);
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(0, 4);
  });
  it('maps black to the origin', () => {
    const out: [number, number, number] = [0, 0, 0];
    linearRgbToOklab(out, 0, 0, 0);
    expect(out).toEqual([0, 0, 0]);
  });
});

describe('oklabToLinearRgb', () => {
  it('round-trips linear RGB through Oklab for a saturated color', () => {
    const lab: [number, number, number] = [0, 0, 0];
    linearRgbToOklab(lab, 0.5, 0.1, 0.8);
    const rgb: [number, number, number] = [0, 0, 0];
    oklabToLinearRgb(rgb, lab[0], lab[1], lab[2]);
    expect(rgb[0]).toBeCloseTo(0.5, 5);
    expect(rgb[1]).toBeCloseTo(0.1, 5);
    expect(rgb[2]).toBeCloseTo(0.8, 5);
  });
  it('preserves negative and greater-than-one channels for out-of-gamut Oklab', () => {
    const rgb: [number, number, number] = [0, 0, 0];
    oklabToLinearRgb(rgb, 0.5, 1, 0);
    expect(rgb.some((channel) => channel < 0)).toBe(true);
    expect(rgb.some((channel) => channel > 1)).toBe(true);
  });

  it('round-trips out-of-gamut linear RGB without silently clamping channels', () => {
    const lab: [number, number, number] = [0, 0, 0];
    linearRgbToOklab(lab, 1.1, -0.05, 0.2);
    const rgb: [number, number, number] = [0, 0, 0];
    oklabToLinearRgb(rgb, lab[0], lab[1], lab[2]);
    expect(rgb[0]).toBeCloseTo(1.1, 5);
    expect(rgb[1]).toBeCloseTo(-0.05, 5);
    expect(rgb[2]).toBeCloseTo(0.2, 5);
  });
});
