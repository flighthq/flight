import type { RenderEffect } from './RenderEffect';

export interface MotionBlurEffect extends RenderEffect {
  kind: 'MotionBlurEffect'; // [MOTION] per-object motion blur from the scene velocity buffer.
  intensity?: number;
  samples?: number;
}
