import type { Effect } from './Effect.ts';

export interface SmaaEffect extends Effect {
  kind: 'SmaaEffect';
  threshold?: number;
}
