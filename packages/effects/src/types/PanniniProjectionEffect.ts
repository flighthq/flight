import type { Effect } from './Effect.ts';
export interface PanniniProjectionEffect extends Effect {
  kind: 'PanniniProjectionEffect';
  compression?: number;
  crop?: number;
}
