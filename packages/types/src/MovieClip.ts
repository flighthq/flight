import type { DisplayObject, DisplayObjectData } from './DisplayObject';
import type { Timeline } from './Timeline';

export interface MovieClipData extends DisplayObjectData {
  timeline: Timeline | null;
}

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}

export const MovieClipKind: unique symbol = Symbol('MovieClip');
