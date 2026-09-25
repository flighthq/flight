import type { Effect } from './Effect.ts';

export interface KuwaharaEffect extends Effect {
  kind: 'KuwaharaEffect';
  radius?: number;
}
