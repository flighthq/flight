import type { RenderEffect } from './RenderEffect';

export interface ChromaticAberrationEffect extends RenderEffect {
  kind: 'ChromaticAberrationEffect';
  intensity?: number;
  radial?: boolean; // increase toward screen edges (lens-like). Default true.
}
