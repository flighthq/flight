import type { Effect } from './Effect';

export interface FxaaEffect extends Effect {
  kind: 'FxaaEffect';
  // Edge contrast threshold; lower catches more edges. Default 0.0312.
  edgeThreshold?: number;
  subpixel?: number;
}
