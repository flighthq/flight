import type { Effect } from './Effect';

export interface MotionBlurEffect extends Effect {
  kind: 'MotionBlurEffect'; // [MOTION] per-object motion blur from the scene velocity buffer.
  intensity?: number;
  samples?: number;
}
