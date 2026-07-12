import type { ColorMatrixAdjustment } from './ColorMatrixAdjustment';

export interface ChannelMixerAdjustment extends ColorMatrixAdjustment {
  kind: 'ChannelMixerAdjustment';
  matrix: readonly number[]; // 3×4 row-major RGB->RGB plus per-row offset (offsets in normalized 0–1). Default identity.
}
