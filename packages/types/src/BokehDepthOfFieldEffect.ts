import type { Effect } from './Effect.ts';

export interface BokehDepthOfFieldEffect extends Effect {
  kind: 'BokehDepthOfFieldEffect'; // [DEPTH]
  focusDistance?: number;
  focusRange?: number;
  maxBlur?: number;
}
