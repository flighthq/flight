import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { Timeline } from './Timeline';

export interface MovieClipData extends DisplayObjectData {
  timeline: Timeline | null;
}

export interface MovieClipRuntime extends DisplayObjectRuntime {}

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}

export const MovieClipKind: unique symbol = Symbol('MovieClip');
