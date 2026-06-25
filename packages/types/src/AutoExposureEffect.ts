import type { RenderEffect } from './RenderEffect';
export interface AutoExposureEffect extends RenderEffect {
  kind: 'AutoExposureEffect';
  adaptationSpeed?: number;
  exposureCompensation?: number;
  maxExposure?: number;
  minExposure?: number;
}
