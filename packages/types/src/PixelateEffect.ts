import type { Effect } from './Effect';

export interface PixelateEffect extends Effect {
  kind: 'PixelateEffect';
  size?: number; // block size in pixels.
}
