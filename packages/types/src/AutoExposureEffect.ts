import type { Effect } from './Effect.ts';
export interface AutoExposureEffect extends Effect {
  kind: 'AutoExposureEffect';
  adaptationSpeed?: number;
  exposureCompensation?: number;
  maxExposure?: number;
  minExposure?: number;
}
