import type { Effect } from './Effect';

export interface WhiteBalanceEffect extends Effect {
  kind: 'WhiteBalanceEffect';
  temperature?: number; // -1..1 warm/cool.
  tint?: number; // -1..1 magenta/green.
}
