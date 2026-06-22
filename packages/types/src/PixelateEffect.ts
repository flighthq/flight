import type { RenderEffect } from './RenderEffect';

export interface PixelateEffect extends RenderEffect {
  kind: 'PixelateEffect';
  size?: number; // block size in pixels.
}
