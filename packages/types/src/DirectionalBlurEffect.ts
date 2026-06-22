import type { RenderEffect } from './RenderEffect';

export interface DirectionalBlurEffect extends RenderEffect {
  kind: 'DirectionalBlurEffect';
  angle?: number; // radians.
  length?: number;
  samples?: number;
}
