import { createHueSaturationAdjustment } from './hueSaturationAdjustment';

describe('createHueSaturationAdjustment', () => {
  it('defaults to the identity and carries a fusable transform', () => {
    const adjustment = createHueSaturationAdjustment();
    expect(adjustment.kind).toBe('HueSaturationAdjustment');
    expect(typeof adjustment.transform).toBe('function');
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.2, 0.4, 0.6);
    expect(out[0]).toBeCloseTo(0.2, 4);
    expect(out[1]).toBeCloseTo(0.4, 4);
    expect(out[2]).toBeCloseTo(0.6, 4);
  });

  it('fully desaturates to luma-preserving grey at saturation 0', () => {
    const adjustment = createHueSaturationAdjustment({ saturation: 0 });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 1, 0, 0);
    // HSL saturation 0 collapses to lightness grey (mid of max/min = 0.5).
    expect(out[0]).toBeCloseTo(0.5, 4);
    expect(out[0]).toBeCloseTo(out[1], 4);
    expect(out[1]).toBeCloseTo(out[2], 4);
  });

  it('rotates hue by 120° mapping red toward green', () => {
    const adjustment = createHueSaturationAdjustment({ hue: 120 });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 1, 0, 0);
    expect(out[1]).toBeCloseTo(1, 4);
    expect(out[0]).toBeCloseTo(0, 4);
    expect(out[2]).toBeCloseTo(0, 4);
  });
});
