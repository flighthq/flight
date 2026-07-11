import { applyColorMatrixToColor } from './colorMatrixMath';
import { createGrayscaleAdjustment } from './grayscaleAdjustment';

describe('createGrayscaleAdjustment', () => {
  it('defaults to full BT.709 luma desaturation', () => {
    const adjustment = createGrayscaleAdjustment();
    expect(adjustment.kind).toBe('GrayscaleAdjustment');
    // Pure red → luma 0.2126·255 ≈ 54, equal across channels; alpha preserved.
    const out = applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xff0000ff);
    const r = (out >>> 24) & 0xff;
    const g = (out >>> 16) & 0xff;
    const b = (out >>> 8) & 0xff;
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBe(Math.round(0.2126 * 255));
    expect(out & 0xff).toBe(0xff);
  });

  it('intensity 0 leaves color unchanged', () => {
    const adjustment = createGrayscaleAdjustment({ intensity: 0 });
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x2040a0ff)).toBe(0x2040a0ff);
  });
});
