import type { RenderEffect } from './RenderEffect';

export interface GrayscaleEffect extends RenderEffect {
  kind: 'GrayscaleEffect';
  intensity?: number; // 0..1 mix. Default 1.
}
