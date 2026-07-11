import { applyColorMatrixToColor } from './colorMatrixMath';
import { createInvertAdjustment } from './invertAdjustment';

describe('createInvertAdjustment', () => {
  it('defaults to a full invert and carries the fusable kind', () => {
    const adjustment = createInvertAdjustment();
    expect(adjustment.kind).toBe('InvertAdjustment');
    expect(adjustment.colorMatrix).toHaveLength(20);
    // Opaque mid-grey inverts to itself; pure red inverts to cyan. Alpha is preserved.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x808080ff)).toBe(0x7f7f7fff);
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xff0000ff)).toBe(0x00ffffff);
  });

  it('intensity 0 is the identity', () => {
    const adjustment = createInvertAdjustment({ intensity: 0 });
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x123456ff)).toBe(0x123456ff);
  });

  it('intensity 0.5 collapses toward mid-grey', () => {
    const adjustment = createInvertAdjustment({ intensity: 0.5 });
    // scale 0, offset 127.5 → every channel rounds to 128.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x00ffccff)).toBe(0x808080ff);
  });
});
