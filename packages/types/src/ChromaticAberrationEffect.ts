import type { Effect } from './Effect';

export interface ChromaticAberrationEffect extends Effect {
  kind: 'ChromaticAberrationEffect';
  intensity?: number;
  radial?: boolean; // increase toward screen edges (lens-like). Default true.
}
