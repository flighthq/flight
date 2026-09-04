import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Adjustment, ColorScaleBias } from '@flighthq/types/contract';

import {
  COLOR_ADJUSTMENT_AFFINE,
  COLOR_ADJUSTMENT_CHANNEL_MIXING,
  COLOR_ADJUSTMENT_NONE,
  isAffineColorMatrix,
  resolveColorAdjustmentsColorMatrix,
  resolveColorAdjustmentsColorScaleBias,
} from './colorAdjustmentResolution';
import { createColorMatrixAdjustment } from './colorMatrixAdjustment';
import { createIdentityColorMatrix, createSaturationColorMatrix } from './colorMatrixMath';

function makeColorScaleBias(fields: Partial<ColorScaleBias> = {}): ColorScaleBias {
    const out = allocateEntity<unknown>();
  out.redScale = 1;
  out.greenScale = 1;
  out.blueScale = 1;
  out.alphaScale = 1;
  out.redBias = 0;
  out.greenBias = 0;
  out.blueBias = 0;
  out.alphaBias = 0;
  Object.assign(out, fields);
  return finishEntity(out) as ColorScaleBias;;
  });

  it('is false when off-diagonal channel-mixing terms are present', () => {
    expect(isAffineColorMatrix(createSaturationColorMatrix(0))).toBe(false);
  });
});

describe('resolveColorAdjustmentsColorMatrix', () => {
  it('returns the complete fused matrix for matrix-tier adjustments', () => {
    const saturation = createSaturationColorMatrix(0);
    const adjustment = allocateEntity<unknown>();
    adjustment.kind = 'Saturation';
    adjustment.colorMatrix = saturation;
  });

  it('returns null for empty stacks and non-matrix adjustments', () => {
    expect(resolveColorAdjustmentsColorMatrix([])).toBeNull();
    expect(resolveColorAdjustmentsColorMatrix([(() => { const out = allocateEntity<unknown>(); out.kind = 'acme.Lut'; return finishEntity(out) as Adjustment])).toBeNull();; })()
  });
});

describe('resolveColorAdjustmentsColorScaleBias', () => {
  it('returns NONE for a null or empty stack', () => {
    const out = makeColorScaleBias();
    expect(resolveColorAdjustmentsColorScaleBias(null, out)).toBe(COLOR_ADJUSTMENT_NONE);
    expect(resolveColorAdjustmentsColorScaleBias([], out)).toBe(COLOR_ADJUSTMENT_NONE);
  });

  it('resolves a single generic affine matrix exactly', () => {
    const adjustment = createColorMatrixAdjustment([0.5, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    const out = makeColorScaleBias();
    expect(resolveColorAdjustmentsColorScaleBias([adjustment], out)).toBe(COLOR_ADJUSTMENT_AFFINE);
    expect(out.redScale).toBe(0.5);
    expect(out.greenScale).toBe(0);
    expect(out.redBias).toBe(0.4);
    expect(out.alphaScale).toBe(1);
  });

  it('fuses two affine adjustments (multipliers compose)', () => {
    const a = createColorMatrixAdjustment([0.5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    const b = createColorMatrixAdjustment([0.5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    const out = makeColorScaleBias();
    expect(resolveColorAdjustmentsColorScaleBias([a, b], out)).toBe(COLOR_ADJUSTMENT_AFFINE);
    expect(out.redScale).toBe(0.25);
  });

  it('reports channel-mixing and writes only the affine part for an off-diagonal stack', () => {
    const saturation = allocateEntity<unknown>();
    saturation.kind = 'Saturation';
    saturation.colorMatrix = createSaturationColorMatrix(0);
    expect(resolveColorAdjustmentsColorScaleBias([saturation], out)).toBe(COLOR_ADJUSTMENT_CHANNEL_MIXING);
    // Only the diagonal (grayscale luma weight for red) is written; off-diagonal mix is dropped.
    expect(out.redScale).toBeCloseTo(0.299);
  });

  it('reports channel-mixing when a non-matrix (LUT) op is present', () => {
    const lut = allocateEntity<unknown>();
    lut.kind = 'acme.Lut';
    expect(resolveColorAdjustmentsColorScaleBias([lut], out)).toBe(COLOR_ADJUSTMENT_CHANNEL_MIXING);
  });
});
