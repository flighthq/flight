import type { Effect } from './Effect';

export interface BokehDepthOfFieldEffect extends Effect {
  kind: 'BokehDepthOfFieldEffect'; // [DEPTH]
  focusDistance?: number;
  focusRange?: number;
  maxBlur?: number;
}
