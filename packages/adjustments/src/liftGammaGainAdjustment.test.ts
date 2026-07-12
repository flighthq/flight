import { createLiftGammaGainAdjustment } from './liftGammaGainAdjustment';

describe('createLiftGammaGainAdjustment', () => {
  it('defaults to approximately neutral', () => {
    // The packed gamma neutral 0x808080 is 128/255 ≈ 0.502, not exactly 0.5, so the default gamma
    // exponent is ≈0.996 rather than 1 — faithful to the ported shader, which was never exactly neutral.
    const adjustment = createLiftGammaGainAdjustment();
    expect(adjustment.kind).toBe('LiftGammaGainAdjustment');
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0.3, 0.6, 0.9);
    expect(out[0]).toBeCloseTo(0.3, 2);
    expect(out[1]).toBeCloseTo(0.6, 2);
    expect(out[2]).toBeCloseTo(0.9, 2);
  });

  it('applies gain as a per-channel multiplier', () => {
    // gain 0x808080ff → ≈0.5 multiplier on each channel (before the near-neutral default gamma).
    const adjustment = createLiftGammaGainAdjustment({ gain: 0x808080ff });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 1, 1, 1);
    expect(out[0]).toBeCloseTo(128 / 255, 2);
  });

  it('lifts shadows toward the lift color', () => {
    // lift 0xffffffff pulls dark values up toward white via (1 - rgb).
    const adjustment = createLiftGammaGainAdjustment({ lift: 0xffffffff });
    const out: [number, number, number] = [0, 0, 0];
    adjustment.transform(out, 0, 0, 0);
    expect(out[0]).toBeCloseTo(1, 4);
  });
});
