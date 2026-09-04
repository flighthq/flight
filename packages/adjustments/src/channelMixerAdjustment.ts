import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ChannelMixerAdjustment, EntityRuntimeKey, EntityConstruction } from '@flighthq/types/contract';

import { initializeColorMatrixAdjustment } from './colorMatrixAdjustment';
import { createChannelMixerColorMatrix } from './colorMatrixMath';

export function createChannelMixerAdjustment(
  options: Readonly<Omit<ChannelMixerAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {
    matrix: IDENTITY_CHANNEL_MIXER,
  },
): ChannelMixerAdjustment {
  const out = allocateEntity<ChannelMixerAdjustment>();
  initializeChannelMixerAdjustment(out, options);
  return finishEntity(out);
}

// Channel mixer as a matrix-tier adjustment. `matrix` is the prior effect's 3×4 row-major RGB→RGB mix
// plus a per-row normalized-linear bias. The 3×3 mix bakes through createChannelMixerColorMatrix;
// the bias column uses the same units without conversion. Alpha is unchanged. The default
// `matrix` is the identity mix.
export function initializeChannelMixerAdjustment(
  out: EntityConstruction<ChannelMixerAdjustment>,
  options: Readonly<Omit<ChannelMixerAdjustment, typeof EntityRuntimeKey | 'kind' | 'colorMatrix'>> = {
    matrix: IDENTITY_CHANNEL_MIXER,
  },
): void {
  const matrix = options.matrix ?? IDENTITY_CHANNEL_MIXER;
  const m = (i: number): number => matrix[i] ?? IDENTITY_CHANNEL_MIXER[i];
  const colorMatrix = createChannelMixerColorMatrix([m(0), m(1), m(2)], [m(4), m(5), m(6)], [m(8), m(9), m(10)]);
  colorMatrix[4] = m(3);
  colorMatrix[9] = m(7);
  colorMatrix[14] = m(11);
  initializeColorMatrixAdjustment(out, 'ChannelMixerAdjustment', colorMatrix);
  out.matrix = matrix;
}

const IDENTITY_CHANNEL_MIXER: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
