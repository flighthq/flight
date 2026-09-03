import type { NonEntityCreateResult } from '@flighthq/types/contract';
import type { ColorScaleBiasAdjustment, ColorScaleBiasLike } from '@flighthq/types/contract';

export function createColorScaleBiasAdjustment(
  colorScaleBias: Readonly<ColorScaleBiasLike>,
): NonEntityCreateResult<ColorScaleBiasAdjustment, 'descriptor'> {
  const value = { ...colorScaleBias };
  return {
    kind: 'ColorScaleBiasAdjustment',
    colorScaleBias: value,
    colorMatrix: [
      value.redScale,
      0,
      0,
      0,
      value.redBias,
      0,
      value.greenScale,
      0,
      0,
      value.greenBias,
      0,
      0,
      value.blueScale,
      0,
      value.blueBias,
      0,
      0,
      0,
      value.alphaScale,
      value.alphaBias,
    ],
  };
}
