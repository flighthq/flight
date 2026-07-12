import type { Adjustment, ColorTransform } from '@flighthq/types';

import {
  COLOR_ADJUSTMENT_AFFINE,
  COLOR_ADJUSTMENT_CHANNEL_MIXING,
  COLOR_ADJUSTMENT_NONE,
  isAffineColorMatrix,
  resolveColorAdjustmentsColorTransform,
} from './colorAdjustmentResolution';
import { createIdentityColorMatrix, createSaturationColorMatrix } from './colorMatrixMath';
import { createColorTransformAdjustment } from './colorTransformAdjustment';

function makeColorTransform(fields: Partial<ColorTransform> = {}): ColorTransform {
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

describe('isAffineColorMatrix', () => {
  it('is true for a diagonal identity matrix', () => {
    expect(isAffineColorMatrix(createIdentityColorMatrix())).toBe(true);
  });

  it('is false when off-diagonal channel-mixing terms are present', () => {
    expect(isAffineColorMatrix(createSaturationColorMatrix(0))).toBe(false);
  });
});

describe('resolveColorAdjustmentsColorTransform', () => {
  it('returns NONE for a null or empty stack', () => {
    const out = makeColorTransform();
    expect(resolveColorAdjustmentsColorTransform(null, out)).toBe(COLOR_ADJUSTMENT_NONE);
    expect(resolveColorAdjustmentsColorTransform([], out)).toBe(COLOR_ADJUSTMENT_NONE);
  });

  it('resolves a single ColorTransformAdjustment exactly (affine)', () => {
    const adjustment = createColorTransformAdjustment(
      makeColorTransform({ redMultiplier: 0.5, greenMultiplier: 0, redOffset: 40 }),
    );
    const out = makeColorTransform();
    expect(resolveColorAdjustmentsColorTransform([adjustment], out)).toBe(COLOR_ADJUSTMENT_AFFINE);
    expect(out.redMultiplier).toBe(0.5);
    expect(out.greenMultiplier).toBe(0);
    expect(out.redOffset).toBe(40);
    expect(out.alphaMultiplier).toBe(1);
  });

  it('fuses two affine adjustments (multipliers compose)', () => {
    const a = createColorTransformAdjustment(makeColorTransform({ redMultiplier: 0.5 }));
    const b = createColorTransformAdjustment(makeColorTransform({ redMultiplier: 0.5 }));
    const out = makeColorTransform();
    expect(resolveColorAdjustmentsColorTransform([a, b], out)).toBe(COLOR_ADJUSTMENT_AFFINE);
    expect(out.redMultiplier).toBe(0.25);
  });

  it('reports channel-mixing and writes only the affine part for an off-diagonal stack', () => {
    const saturation: Adjustment = { kind: 'Saturation', colorMatrix: createSaturationColorMatrix(0) } as Adjustment;
    const out = makeColorTransform();
    expect(resolveColorAdjustmentsColorTransform([saturation], out)).toBe(COLOR_ADJUSTMENT_CHANNEL_MIXING);
    // Only the diagonal (grayscale luma weight for red) is written; off-diagonal mix is dropped.
    expect(out.redMultiplier).toBeCloseTo(0.299);
  });

  it('reports channel-mixing when a non-matrix (LUT) op is present', () => {
    const lut: Adjustment = { kind: 'acme.Lut' };
    const out = makeColorTransform();
    expect(resolveColorAdjustmentsColorTransform([lut], out)).toBe(COLOR_ADJUSTMENT_CHANNEL_MIXING);
  });
});
