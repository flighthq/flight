import type { Effect } from './Effect';

export interface DitherEffect extends Effect {
  kind: 'DitherEffect';
  levels?: number;
}
