import type { RenderEffect } from './RenderEffect';

export interface ScanlinesEffect extends RenderEffect {
  kind: 'ScanlinesEffect';
  count?: number;
  intensity?: number;
}
