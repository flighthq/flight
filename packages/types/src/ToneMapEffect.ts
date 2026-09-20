import type { Effect } from './Effect';

export type ToneMapOperator = 'reinhard' | 'aces' | 'filmic' | 'agx' | 'uncharted2';

export interface ToneMapEffect extends Effect {
  kind: 'ToneMapEffect'; // [HDR]
  operator?: ToneMapOperator;
  exposure?: number;
  white?: number; // white point (Reinhard extended / filmic).
}
