import type { Effect } from './Effect';

export interface SsaoEffect extends Effect {
  kind: 'SsaoEffect'; // [DEPTH]
  radius?: number;
  intensity?: number;
  bias?: number;
  samples?: number;
}
