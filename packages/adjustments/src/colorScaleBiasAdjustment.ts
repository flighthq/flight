import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ColorScaleBiasAdjustment, ColorScaleBiasLike, EntityConstruction } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';

export function createColorScaleBiasAdjustment(colorScaleBias: Readonly<ColorScaleBiasLike>): ColorScaleBiasAdjustment {
  const out = allocateEntity<ColorScaleBiasAdjustment>();
  initializeColorScaleBiasAdjustment(out, colorScaleBias);
  return finishEntity(out);
}

export function initializeColorScaleBiasAdjustment(
  out: EntityConstruction<ColorScaleBiasAdjustment>,
  colorScaleBias: Readonly<ColorScaleBiasLike>,
): void {
  const value = { ...colorScaleBias };
  // prettier-ignore
  const colorMatrix = [
    value.redScale, 0, 0, 0, value.redBias,
    0, value.greenScale, 0, 0, value.greenBias,
    0, 0, value.blueScale, 0, value.blueBias,
    0, 0, 0, value.alphaScale, value.alphaBias,
  ];
  initializeColorMatrixAdjustment(out, 'ColorScaleBiasAdjustment', colorMatrix);
  out.colorScaleBias = value;
}
