import type { Effect } from './Effect';

export interface SmaaEffect extends Effect {
  kind: 'SmaaEffect';
  threshold?: number;
}
