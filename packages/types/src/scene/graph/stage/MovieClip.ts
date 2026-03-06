import type { Timeline } from '../../../animation/timeline';
import type { DisplayObject, PrimitiveData } from './DisplayObject';

export interface MovieClipData extends PrimitiveData {
  timeline: Timeline | null;
}

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}
