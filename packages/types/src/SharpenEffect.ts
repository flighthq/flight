import type { Effect } from './Effect';

export interface SharpenEffect extends Effect {
  kind: 'SharpenEffect';
  amount?: number;
}
