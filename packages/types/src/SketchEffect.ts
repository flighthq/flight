import type { Effect } from './Effect.ts';

export interface SketchEffect extends Effect {
  kind: 'SketchEffect';
  strength?: number;
}
