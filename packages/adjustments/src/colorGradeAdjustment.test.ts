import { createColorGradeAdjustment } from './colorGradeAdjustment';

describe('createColorGradeAdjustment', () => {
  it('defaults to approximately neutral (contrast 1, all stages near-neutral)', () => {
    // The lift/gamma/gain stage's packed neutral 0x808080 gamma is 128/255 ≈ 0.502, so the default is
    // near- (not exactly) neutral — faithful to the ported shader.
    const adjustment = createColorGradeAdjustment();
    expect(adjustment.kind).toBe('ColorGradeAdjustment');
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.3, 0.5, 0.7);
    expect(out[0]).toBeCloseTo(0.3, 2);
    expect(out[1]).toBeCloseTo(0.5, 2);
    expect(out[2]).toBeCloseTo(0.7, 2);
  });

  it('scales contrast about mid-grey', () => {
    const adjustment = createColorGradeAdjustment({ contrast: 2 });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.5, 0.5, 0.5);
    // Mid-grey is the pivot → unchanged (within the near-neutral default gamma).
    expect(out[0]).toBeCloseTo(0.5, 2);
    adjustment.transform(out, 0.75, 0.75, 0.75);
    // (0.75 - 0.5)·2 + 0.5 = 1, and pow(1, gamma) = 1 exactly.
    expect(out[0]).toBeCloseTo(1, 4);
  });

  it('desaturates toward luma at saturation 0', () => {
    const adjustment = createColorGradeAdjustment({ saturation: 0 });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 1, 0, 0);
    // Rec.709 luma of pure red is 0.2126 on every channel (within the near-neutral default gamma).
    expect(out[0]).toBeCloseTo(0.2126, 2);
    expect(out[1]).toBeCloseTo(0.2126, 2);
    expect(out[2]).toBeCloseTo(0.2126, 2);
  });
});
