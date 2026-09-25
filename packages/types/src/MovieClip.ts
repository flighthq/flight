import type { MovieClipSignals } from './MovieClipSignals.ts';
import type { Node2D, Node2DData, Node2DRuntime } from './Node2D.ts';
import type { Timeline } from './Timeline.ts';

export interface MovieClipData extends Node2DData {
  timeline: Timeline | null;
}

export interface MovieClipRuntime extends Node2DRuntime {
  movieClipSignals: MovieClipSignals | null;
}

export interface MovieClip extends Node2D {
  data: MovieClipData;
}

export const MovieClipKind = 'MovieClip';
