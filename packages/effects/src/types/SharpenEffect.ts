import type { Effect } from './Effect.ts';

export interface SharpenEffect extends Effect {
  kind: 'SharpenEffect';
  amount?: number;
}
