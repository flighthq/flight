import type { Effect } from './Effect.ts';

export interface CameraMotionBlurEffect extends Effect {
  kind: 'CameraMotionBlurEffect'; // [MOTION]
  intensity?: number;
  samples?: number;
}
