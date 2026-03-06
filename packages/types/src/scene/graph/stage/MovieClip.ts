import type { Timeline } from '../../../animation/timeline';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface MovieClipData extends DisplayObjectData {
  timeline: Timeline | null;
}

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}
