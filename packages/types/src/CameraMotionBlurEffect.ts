import type { Effect } from './Effect';

export interface CameraMotionBlurEffect extends Effect {
  kind: 'CameraMotionBlurEffect'; // [MOTION]
  intensity?: number;
  samples?: number;
}
