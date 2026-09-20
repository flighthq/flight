import type { Effect } from './Effect';

export interface SketchEffect extends Effect {
  kind: 'SketchEffect';
  strength?: number;
}
