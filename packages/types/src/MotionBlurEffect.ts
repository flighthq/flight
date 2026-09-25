import type { Effect } from './Effect.ts';

export interface MotionBlurEffect extends Effect {
  kind: 'MotionBlurEffect'; // [MOTION] per-object motion blur from the scene velocity buffer.
  intensity?: number;
  samples?: number;
}
