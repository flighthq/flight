import { createBrightnessContrastAdjustment } from './brightnessContrastAdjustment';
import { applyColorMatrixToColor } from './colorMatrixMath';

describe('createBrightnessContrastAdjustment', () => {
  it('defaults to the identity (brightness 0, contrast 1)', () => {
    const adjustment = createBrightnessContrastAdjustment();
    expect(adjustment.kind).toBe('BrightnessContrastAdjustment');
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x3366aaff)).toBe(0x3366aaff);
  });

  it('scales contrast about mid-grey 0.5, leaving mid-grey fixed', () => {
    const adjustment = createBrightnessContrastAdjustment({ contrast: 0.5 });
    // 128 is the pivot → unchanged; black lifts toward mid-grey (255·0.5·0.5 = 63.75 → 64).
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x808080ff)).toBe(0x808080ff);
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x000000ff)).toBe(0x404040ff);
  });

  it('reproduces the prior shader (rgb + brightness − 0.5)·contrast + 0.5', () => {
    // Scene values: brightness 0.15, contrast 0.35. White → (1 + 0.15 − 0.5)·0.35 + 0.5 = 0.7275 → 186.
    const adjustment = createBrightnessContrastAdjustment({ brightness: 0.15, contrast: 0.35 });
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xffffffff)).toBe(0xbababaff);
  });
});
