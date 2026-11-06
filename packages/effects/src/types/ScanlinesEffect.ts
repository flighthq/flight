import type { Effect } from './Effect.ts';

export interface ScanlinesEffect extends Effect {
  kind: 'ScanlinesEffect';
  count?: number;
  intensity?: number;
}
