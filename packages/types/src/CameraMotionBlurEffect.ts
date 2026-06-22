import type { RenderEffect } from './RenderEffect';

export interface CameraMotionBlurEffect extends RenderEffect {
  kind: 'CameraMotionBlurEffect'; // [MOTION]
  intensity?: number;
  samples?: number;
}
