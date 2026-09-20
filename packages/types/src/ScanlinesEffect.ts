import type { Effect } from './Effect';

export interface ScanlinesEffect extends Effect {
  kind: 'ScanlinesEffect';
  count?: number;
  intensity?: number;
}
