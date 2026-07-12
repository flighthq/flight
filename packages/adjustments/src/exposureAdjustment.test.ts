import { applyColorMatrixToColor } from './colorMatrixMath';
import { createExposureAdjustment } from './exposureAdjustment';

describe('createExposureAdjustment', () => {
  it('defaults to the identity (exposure 0)', () => {
    const adjustment = createExposureAdjustment();
    expect(adjustment.kind).toBe('ExposureAdjustment');
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x204060ff)).toBe(0x204060ff);
  });

  it('scales RGB by 2^exposure, preserving alpha', () => {
    const adjustment = createExposureAdjustment({ exposure: 1 });
    // Each channel doubles; alpha is untouched.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x204060ff)).toBe(0x4080c0ff);
  });

  it('clamps to SDR [0,1] for the default pipeline', () => {
    const adjustment = createExposureAdjustment({ exposure: 1 });
    // 0x80 doubled is 256 → clamps to 255.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x808080ff)).toBe(0xffffffff);
  });
});
