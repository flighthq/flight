import type { Effect } from './Effect.ts';

export interface TaaEffect extends Effect {
  kind: 'TaaEffect'; // [TEMPORAL] needs a history buffer + motion vectors.
  feedback?: number;
}
