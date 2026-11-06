import type { Effect } from './Effect.ts';

export interface SsrEffect extends Effect {
  kind: 'SsrEffect'; // [DEPTH]
  maxDistance?: number;
  resolution?: number;
  steps?: number;
}
