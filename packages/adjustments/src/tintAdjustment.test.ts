import { describe, expect, it } from 'vitest';

import { applyColorMatrixToColor } from './colorMatrixMath';
import { createTintAdjustment, initializeTintAdjustment } from './tintAdjustment';

describe('createTintAdjustment', () => {
  it('carries the TintAdjustment kind and a 20-length diagonal matrix', () => {
    const tint = createTintAdjustment(0xff0000ff);
    expect(tint.kind).toBe('TintAdjustment');
    expect(tint.colorMatrix).toHaveLength(20);
    // Diagonal multipliers at 0/6/12/18, offsets (4/9/14/19) zero, no off-diagonal terms.
    expect(tint.colorMatrix[0]).toBe(1);
    expect(tint.colorMatrix[6]).toBe(0);
    expect(tint.colorMatrix[12]).toBe(0);
    expect(tint.colorMatrix[18]).toBe(1);
    expect(tint.colorMatrix[4]).toBe(0);
    expect(tint.colorMatrix[1]).toBe(0);
    expect(tint.colorMatrix[19]).toBe(0);
  });

  it('multiplies a white pixel down to the tint color', () => {
    expect(applyColorMatrixToColor(createTintAdjustment(0x000000ff).colorMatrix, 0xffffffff)).toBe(0x000000ff);
    expect(applyColorMatrixToColor(createTintAdjustment(0xff0000ff).colorMatrix, 0xffffffff)).toBe(0xff0000ff);
    expect(applyColorMatrixToColor(createTintAdjustment(0x808080ff).colorMatrix, 0xffffffff)).toBe(0x808080ff);
  });

  it('scales an arbitrary pixel per channel', () => {
    // Half-tint on mid-grey halves each colour channel; full alpha leaves alpha unchanged.
    expect(applyColorMatrixToColor(createTintAdjustment(0x808080ff).colorMatrix, 0x808080ff)).toBe(0x404040ff);
  });
});
describe('initializeTintAdjustment', () => {
  it('is the construction initializer of createTintAdjustment', () => {
    expect(typeof initializeTintAdjustment).toBe('function');
  });
});
