import type { ColorTransform } from '@flighthq/types';

import { applyColorMatrixToColor } from './colorMatrixMath';
import { createColorTransformAdjustment } from './colorTransformAdjustment';

function makeColorTransform(fields: Partial<ColorTransform>): ColorTransform {
  return {
    redMultiplier: 1,
    greenMultiplier: 1,
    blueMultiplier: 1,
    alphaMultiplier: 1,
    redOffset: 0,
    greenOffset: 0,
    blueOffset: 0,
    alphaOffset: 0,
    ...fields,
  } as ColorTransform;
}

describe('createColorTransformAdjustment', () => {
  it('carries the ColorTransform payload and the ColorTransformAdjustment kind', () => {
    const colorTransform = makeColorTransform({ redMultiplier: 0.5 });
    const adjustment = createColorTransformAdjustment(colorTransform);
    expect(adjustment.kind).toBe('ColorTransformAdjustment');
    expect(adjustment.colorTransform).toBe(colorTransform);
  });

  it('bakes a diagonal-affine 4×5 matrix so white tints to red', () => {
    const adjustment = createColorTransformAdjustment(
      makeColorTransform({ redMultiplier: 1, greenMultiplier: 0, blueMultiplier: 0 }),
    );
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0xffffffff)).toBe(0xff0000ff);
  });

  it('bakes offsets in the 0–255 column', () => {
    const adjustment = createColorTransformAdjustment(makeColorTransform({ redOffset: 40 }));
    // Red channel 0x10 (16) + 40 = 56 = 0x38; other channels unchanged.
    expect(applyColorMatrixToColor(adjustment.colorMatrix as number[], 0x102030ff)).toBe(0x382030ff);
  });
});
