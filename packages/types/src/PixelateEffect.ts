import type { Effect } from './Effect.ts';

export interface PixelateEffect extends Effect {
  kind: 'PixelateEffect';
  size?: number; // block size in pixels.
}
