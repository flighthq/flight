import { applyColorMatrixToColor } from './colorMatrixMath';
import { createSepiaAdjustment } from './sepiaAdjustment';

describe('createSepiaAdjustment', () => {
  it('defaults to a full sepia tone', () => {
    const adjustment = createSepiaAdjustment();
    expect(adjustment.kind).toBe('SepiaAdjustment');
    // White stays warm-white; red maps to the sepia red row (0.393·255 ≈ 100). Alpha preserved.
    const red = applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xff0000ff);
    expect((red >>> 24) & 0xff).toBe(Math.round(0.393 * 255));
    expect(red & 0xff).toBe(0xff);
  });

  it('intensity 0 leaves color unchanged', () => {
    const adjustment = createSepiaAdjustment({ intensity: 0 });
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x3366ccff)).toBe(0x3366ccff);
  });
});
