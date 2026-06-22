import type { RenderEffect } from './RenderEffect';

export interface KuwaharaEffect extends RenderEffect {
  kind: 'KuwaharaEffect';
  radius?: number;
}
