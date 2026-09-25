import type { Effect } from './Effect.ts';

export interface DitherEffect extends Effect {
  kind: 'DitherEffect';
  levels?: number;
}
