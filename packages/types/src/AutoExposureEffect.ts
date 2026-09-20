import type { Effect } from './Effect';
export interface AutoExposureEffect extends Effect {
  kind: 'AutoExposureEffect';
  adaptationSpeed?: number;
  exposureCompensation?: number;
  maxExposure?: number;
  minExposure?: number;
}
