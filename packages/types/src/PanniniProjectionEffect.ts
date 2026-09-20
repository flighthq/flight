import type { Effect } from './Effect';
export interface PanniniProjectionEffect extends Effect {
  kind: 'PanniniProjectionEffect';
  compression?: number;
  crop?: number;
}
