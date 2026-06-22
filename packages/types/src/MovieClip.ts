import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { MovieClipSignals } from './MovieClipSignals';
import type { Timeline } from './Timeline';

export interface MovieClipData extends DisplayObjectData {
  timeline: Timeline | null;
}

export interface MovieClipRuntime extends DisplayObjectRuntime {
  movieClipSignals: MovieClipSignals | null;
}

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}

export const MovieClipKind = 'MovieClip';
