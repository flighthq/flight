import type { Effect } from './Effect';

export interface KuwaharaEffect extends Effect {
  kind: 'KuwaharaEffect';
  radius?: number;
}
