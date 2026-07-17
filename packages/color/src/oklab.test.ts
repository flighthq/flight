import { linearRgbToOklab, oklabToLinearRgb } from './oklab';

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
  it('clamps negative linear channels to zero', () => {
    const rgb: [number, number, number] = [0, 0, 0];
    oklabToLinearRgb(rgb, 0, 1, 0);
    expect(rgb[0]).toBeGreaterThanOrEqual(0);
    expect(rgb[1]).toBeGreaterThanOrEqual(0);
    expect(rgb[2]).toBeGreaterThanOrEqual(0);
  });
});
