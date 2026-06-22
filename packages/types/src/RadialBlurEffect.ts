import type { RenderEffect } from './RenderEffect';

export interface RadialBlurEffect extends RenderEffect {
  kind: 'RadialBlurEffect';
  centerX?: number; // 0..1.
  centerY?: number;
  strength?: number;
  samples?: number;
}
