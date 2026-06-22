import type { RenderEffect } from './RenderEffect';

export interface ChannelMixerEffect extends RenderEffect {
  kind: 'ChannelMixerEffect';
  matrix: ReadonlyArray<number>; // 3x4 row-major RGB->RGB plus offset.
}
