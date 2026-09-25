import type { Effect } from './Effect.ts';

export interface SsaoEffect extends Effect {
  kind: 'SsaoEffect'; // [DEPTH]
  radius?: number;
  intensity?: number;
  bias?: number;
  samples?: number;
}
